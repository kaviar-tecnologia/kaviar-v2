/**
 * Outbound Payment Provider Implementations.
 *
 * AsaasOutboundPaymentProvider — real Asaas API (Sandbox or Production)
 * FakeOutboundPaymentProvider — local tests only
 * UnavailableOutboundPaymentProvider — fail-closed default
 */

import {
  OutboundPaymentProvider,
  ProviderAvailability,
  Money,
  CreateTransferInput,
  CreateTransferResult,
  TransferResult,
  CreateBillPaymentInput,
  CreateBillPaymentResult,
  BillPaymentResult,
  NormalizedProviderEvent,
  OUTBOUND_PAYMENT_ERRORS,
} from './types';

// ─── Asaas Provider ──────────────────────────────────────────────────────────

export class AsaasOutboundPaymentProvider implements OutboundPaymentProvider {
  readonly providerName = 'asaas';

  private get baseUrl(): string {
    return process.env.ASAAS_BASE_URL ?? 'https://sandbox.asaas.com/api';
  }

  private get apiKey(): string {
    const key = process.env.ASAAS_API_KEY;
    if (!key) throw new Error('ASAAS_API_KEY is not configured');
    return key;
  }

  private get timeoutMs(): number {
    return parseInt(process.env.ASAAS_TIMEOUT_MS ?? '30000');
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'access_token': this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw Object.assign(new Error(`Asaas API error: ${res.status}`), {
          status: res.status,
          body: errBody,
        });
      }

      return await res.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateAvailability(): Promise<ProviderAvailability> {
    try {
      const balance = await this.getAvailableBalance();
      return { available: true };
    } catch (err: any) {
      return { available: false, reason: err.message };
    }
  }

  async getAvailableBalance(): Promise<Money> {
    const data = await this.request<{ balance: number }>('/v3/finance/balance', 'GET');
    return { amountCents: BigInt(Math.round(data.balance * 100)), currency: 'BRL' };
  }

  async createTransfer(input: CreateTransferInput): Promise<CreateTransferResult> {
    try {
      const body: Record<string, unknown> = {
        value: Number(input.amountCents) / 100,
        pixAddressKey: input.pixAddressKey,
        pixAddressKeyType: input.pixAddressKeyType,
        operationType: 'PIX',
        externalReference: input.externalReference,
      };
      if (input.description) body.description = input.description;

      const data = await this.request<{ id: string; status: string }>('/v3/transfers', 'POST', body);

      return {
        success: true,
        providerTransferId: data.id,
        providerStatus: data.status,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, errorCode: 'TIMEOUT', errorMessage: 'Request timed out', isTimeout: true };
      }
      const isDefinitive = err.status === 400 || err.status === 422;
      return {
        success: false,
        errorCode: `HTTP_${err.status ?? 'UNKNOWN'}`,
        errorMessage: err.message,
        isDefinitiveFailure: isDefinitive,
        isTimeout: false,
      };
    }
  }

  async getTransfer(providerTransferId: string): Promise<TransferResult> {
    try {
      const data = await this.request<{
        id: string; status: string; value: number; externalReference?: string;
        transferFee?: number; effectiveDate?: string;
      }>(`/v3/transfers/${providerTransferId}`, 'GET');

      return {
        found: true,
        providerTransferId: data.id,
        providerStatus: data.status,
        amountCents: BigInt(Math.round(data.value * 100)),
        externalReference: data.externalReference,
        feeCents: data.transferFee ? BigInt(Math.round(data.transferFee * 100)) : undefined,
      };
    } catch {
      return { found: false };
    }
  }

  async findTransferByExternalReference(ref: string): Promise<TransferResult | null> {
    try {
      const data = await this.request<{ data: Array<{ id: string; status: string; value: number; externalReference: string }> }>(
        `/v3/transfers?externalReference=${encodeURIComponent(ref)}`, 'GET'
      );
      if (!data.data?.length) return null;
      const t = data.data[0];
      return {
        found: true,
        providerTransferId: t.id,
        providerStatus: t.status,
        amountCents: BigInt(Math.round(t.value * 100)),
        externalReference: t.externalReference,
      };
    } catch {
      return null;
    }
  }

  async createBillPayment(input: CreateBillPaymentInput): Promise<CreateBillPaymentResult> {
    try {
      const body: Record<string, unknown> = {
        identificationField: input.identificationField,
        externalReference: input.externalReference,
      };
      if (input.description) body.description = input.description;
      if (input.scheduleDate) body.scheduleDate = input.scheduleDate;

      const data = await this.request<{ id: string; status: string; value: number }>('/v3/bill', 'POST', body);

      return {
        success: true,
        providerBillId: data.id,
        providerStatus: data.status,
        amountCents: BigInt(Math.round(data.value * 100)),
      };
    } catch (err: any) {
      const isDefinitive = err.status === 400 || err.status === 422;
      return {
        success: false,
        errorCode: `HTTP_${err.status ?? 'UNKNOWN'}`,
        errorMessage: err.message,
        isDefinitiveFailure: isDefinitive,
      };
    }
  }

  async getBillPayment(providerBillId: string): Promise<BillPaymentResult> {
    try {
      const data = await this.request<{ id: string; status: string; value: number; externalReference?: string }>(
        `/v3/bill/${providerBillId}`, 'GET'
      );
      return {
        found: true,
        providerBillId: data.id,
        providerStatus: data.status,
        amountCents: BigInt(Math.round(data.value * 100)),
        externalReference: data.externalReference,
      };
    } catch {
      return { found: false };
    }
  }

  normalizeWebhook(input: unknown): NormalizedProviderEvent {
    const data = input as Record<string, unknown>;
    const event = data.event as Record<string, unknown> ?? data;
    const transfer = data.transfer as Record<string, unknown> | undefined;
    const bill = data.bill as Record<string, unknown> | undefined;

    // Determine category
    const eventName = (event.type ?? event.event ?? '') as string;
    const isTransfer = eventName.startsWith('TRANSFER_') || !!transfer;
    const isBill = eventName.startsWith('BILL_') || !!bill;

    const category = isBill ? 'BILL_PAYMENT' : 'TRANSFER';
    const entity = transfer ?? bill ?? event;

    // Map status
    let eventType: NormalizedProviderEvent['eventType'] = 'UNKNOWN';
    const status = (entity.status as string ?? '').toUpperCase();
    if (status === 'DONE' || status === 'CONFIRMED') eventType = 'DONE';
    else if (status === 'PENDING' || status === 'BANK_PROCESSING') eventType = 'PENDING';
    else if (status === 'IN_BANK_PROCESSING') eventType = 'PROCESSING';
    else if (status === 'FAILED' || status === 'ERROR') eventType = 'FAILED';
    else if (status === 'CANCELLED') eventType = 'CANCELLED';

    return {
      providerEventId: (event.id ?? data.id ?? `asaas_${Date.now()}`) as string,
      providerPayoutId: (entity.id ?? '') as string,
      eventCategory: category,
      eventType,
      amountCents: entity.value ? BigInt(Math.round(Number(entity.value) * 100)) : undefined,
      externalReference: entity.externalReference as string | undefined,
      raw: data as Record<string, unknown>,
    };
  }
}

// ─── Fake Provider (tests only) ──────────────────────────────────────────────

function assertFakeAllowed(): void {
  const nodeEnv = process.env.NODE_ENV ?? '';
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    throw Object.assign(new Error(`FakeProvider blocked in ${nodeEnv}`), { code: OUTBOUND_PAYMENT_ERRORS.FAKE_IN_PRODUCTION });
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
        throw Object.assign(new Error('FakeProvider blocked: remote DB'), { code: OUTBOUND_PAYMENT_ERRORS.FAKE_IN_PRODUCTION });
      }
      if (/rds\.amazonaws\.com/i.test(parsed.hostname)) {
        throw Object.assign(new Error('FakeProvider blocked: RDS'), { code: OUTBOUND_PAYMENT_ERRORS.FAKE_IN_PRODUCTION });
      }
      const dbName = parsed.pathname?.slice(1) ?? '';
      if (dbName && !/(test|dev)/i.test(dbName)) {
        throw Object.assign(new Error('FakeProvider blocked: db not test/dev'), { code: OUTBOUND_PAYMENT_ERRORS.FAKE_IN_PRODUCTION });
      }
    } catch (e: any) { if (e.code === OUTBOUND_PAYMENT_ERRORS.FAKE_IN_PRODUCTION) throw e; }
  }
}

export class FakeOutboundPaymentProvider implements OutboundPaymentProvider {
  readonly providerName = 'fake';
  public transfers = new Map<string, { status: string; amountCents: bigint; externalReference: string }>();
  public bills = new Map<string, { status: string; amountCents: bigint }>();
  public createCallCount = 0;
  public behavior: 'success' | 'timeout' | 'definitive_failure' | 'temporary_failure' = 'success';
  public balanceCents = 1_000_000n;

  constructor() { assertFakeAllowed(); }

  async validateAvailability(): Promise<ProviderAvailability> {
    assertFakeAllowed();
    return { available: true };
  }

  async getAvailableBalance(): Promise<Money> {
    return { amountCents: this.balanceCents, currency: 'BRL' };
  }

  async createTransfer(input: CreateTransferInput): Promise<CreateTransferResult> {
    assertFakeAllowed();
    this.createCallCount++;
    if (this.behavior === 'timeout') return { success: false, errorCode: 'TIMEOUT', isTimeout: true };
    if (this.behavior === 'definitive_failure') return { success: false, errorCode: 'INVALID_PIX_KEY', isDefinitiveFailure: true };
    if (this.behavior === 'temporary_failure') return { success: false, errorCode: 'SERVICE_UNAVAILABLE' };
    const id = `fake_transfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.transfers.set(id, { status: 'PENDING', amountCents: input.amountCents, externalReference: input.externalReference });
    return { success: true, providerTransferId: id, providerStatus: 'PENDING' };
  }

  async getTransfer(id: string): Promise<TransferResult> {
    const t = this.transfers.get(id);
    if (!t) return { found: false };
    return { found: true, providerTransferId: id, providerStatus: t.status, amountCents: t.amountCents, externalReference: t.externalReference };
  }

  async findTransferByExternalReference(ref: string): Promise<TransferResult | null> {
    for (const [id, t] of this.transfers) {
      if (t.externalReference === ref) return { found: true, providerTransferId: id, providerStatus: t.status, amountCents: t.amountCents, externalReference: ref };
    }
    return null;
  }

  async createBillPayment(input: CreateBillPaymentInput): Promise<CreateBillPaymentResult> {
    assertFakeAllowed();
    const id = `fake_bill_${Date.now()}`;
    this.bills.set(id, { status: 'PENDING', amountCents: 10000n });
    return { success: true, providerBillId: id, providerStatus: 'PENDING', amountCents: 10000n };
  }

  async getBillPayment(id: string): Promise<BillPaymentResult> {
    const b = this.bills.get(id);
    if (!b) return { found: false };
    return { found: true, providerBillId: id, providerStatus: b.status, amountCents: b.amountCents };
  }

  normalizeWebhook(input: unknown): NormalizedProviderEvent {
    const d = input as Record<string, unknown>;
    return {
      providerEventId: d.eventId as string ?? `fake_${Date.now()}`,
      providerPayoutId: d.payoutId as string ?? '',
      eventCategory: (d.category as 'TRANSFER') ?? 'TRANSFER',
      eventType: (d.status as 'DONE') ?? 'UNKNOWN',
      amountCents: d.amountCents != null ? BigInt(d.amountCents as string) : undefined,
      externalReference: d.externalReference as string | undefined,
      raw: d,
    };
  }

  simulateCompletion(id: string) { const t = this.transfers.get(id); if (t) t.status = 'DONE'; }
  simulateFailure(id: string) { const t = this.transfers.get(id); if (t) t.status = 'FAILED'; }
  reset() { this.transfers.clear(); this.bills.clear(); this.createCallCount = 0; this.behavior = 'success'; }
}

// ─── Unavailable Provider ────────────────────────────────────────────────────

export class UnavailableOutboundPaymentProvider implements OutboundPaymentProvider {
  readonly providerName = 'unavailable';
  async validateAvailability() { return { available: false, reason: OUTBOUND_PAYMENT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED }; }
  async getAvailableBalance() { return { amountCents: 0n, currency: 'BRL' }; }
  async createTransfer() { return { success: false, errorCode: OUTBOUND_PAYMENT_ERRORS.PROVIDER_UNAVAILABLE } as CreateTransferResult; }
  async getTransfer() { return { found: false } as TransferResult; }
  async createBillPayment() { return { success: false, errorCode: OUTBOUND_PAYMENT_ERRORS.PROVIDER_UNAVAILABLE } as CreateBillPaymentResult; }
  async getBillPayment() { return { found: false } as BillPaymentResult; }
  normalizeWebhook() { return { providerEventId: '', providerPayoutId: '', eventCategory: 'TRANSFER' as const, eventType: 'UNKNOWN' as const, raw: {} }; }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createOutboundPaymentProvider(): OutboundPaymentProvider {
  const enabled = process.env.OUTBOUND_PAYMENTS_ENABLED === 'true';
  if (!enabled) return new UnavailableOutboundPaymentProvider();

  const providerName = process.env.OUTBOUND_PAYMENT_PROVIDER ?? '';
  switch (providerName) {
    case 'asaas': return new AsaasOutboundPaymentProvider();
    case 'fake': { assertFakeAllowed(); return new FakeOutboundPaymentProvider(); }
    default: return new UnavailableOutboundPaymentProvider();
  }
}
