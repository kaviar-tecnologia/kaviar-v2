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
import type { AccountStatusResponse } from './account-preflight';

// ─── Asaas Provider ──────────────────────────────────────────────────────────

export class AsaasOutboundPaymentProvider implements OutboundPaymentProvider {
  readonly providerName = 'asaas';

  private get baseUrl(): string {
    // Asaas' current API roots are api-sandbox.asaas.com and api.asaas.com.
    // Production must select the target explicitly; never silently route live
    // payment credentials to a default sandbox (or vice versa).
    const configured = process.env.ASAAS_BASE_URL?.trim();
    if (!configured && process.env.NODE_ENV === 'production') {
      throw new Error('ASAAS_BASE_URL must be explicitly configured in production');
    }
    const parsed = new URL(configured || 'https://api-sandbox.asaas.com');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.search || parsed.hash || !['/', ''].includes(parsed.pathname) ||
        !['api.asaas.com', 'api-sandbox.asaas.com'].includes(parsed.hostname)) {
      throw new Error('Invalid Asaas API base URL');
    }
    if (process.env.NODE_ENV === 'production' && parsed.hostname !== 'api.asaas.com') {
      throw new Error('Production Asaas API origin must be api.asaas.com');
    }
    return parsed.origin;
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

  /** Fail-closed account preflight: both fields come from authenticated Asaas GETs.
   * Transfer capability requires separate operator confirmation; balance availability
   * does not establish a transfer permission.
   */
  async getAccountStatus(): Promise<AccountStatusResponse | null> {
    try {
      const [commercial, status] = await Promise.all([
        this.request<{ personType?: string; cpfCnpj?: string }>('/v3/myAccount/commercialInfo', 'GET'),
        this.request<{ general?: string }>('/v3/myAccount/status', 'GET'),
      ]);
      return {
        personType: commercial.personType,
        cpfCnpj: commercial.cpfCnpj,
        generalStatus: status.general,
        transfersEnabled: process.env.ASAAS_PAYOUT_TRANSFER_CAPABILITY_CONFIRMED === 'true',
      };
    } catch {
      return null;
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
    if (input.amountCents <= 0n || input.amountCents > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { success: false, errorCode: 'INVALID_AMOUNT', isDefinitiveFailure: true };
    }
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
      // A rejected HTTP response after POST is not independent evidence
      // that Asaas did NOT create a transfer/bill. Reconcile rather than
      // releasing a reservation or automatically retrying.
      return {
        success: false,
        errorCode: `HTTP_${err.status ?? 'UNKNOWN'}`,
        errorMessage: err.message,
        isDefinitiveFailure: false,
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

  async findTransferByExternalReference(ref: string, createdAt?: Date): Promise<TransferResult | null> {
    try {
      if (!ref || (createdAt && Number.isNaN(createdAt.getTime()))) return null;
      // The documented transfer listing supports creation-date filters, not a
      // server-side externalReference filter. Scan bounded pages and compare
      // references locally. An incomplete scan or multiple matches is ambiguous.
      const start = createdAt && createdAt.getTime() <= Date.now()
        ? new Date(createdAt.getTime() - 86_400_000)
        : new Date(Date.now() - 7 * 86_400_000);
      const end = new Date(Date.now() + 86_400_000);
      const date = (d: Date) => d.toISOString().slice(0, 10);
      const matches: Array<{ id: string; status: string; value: number; externalReference: string }> = [];
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({
          'dateCreated[ge]': date(start), 'dateCreated[le]': date(end),
          limit: '100', offset: String(page * 100),
        });
        const response = await this.request<{
          data?: Array<{ id: string; status: string; value: number; externalReference: string }>;
          hasMore?: boolean;
        }>(`/v3/transfers?${params.toString()}`, 'GET');
        if (!Array.isArray(response.data)) return null;
        matches.push(...response.data.filter(t => t.externalReference === ref));
        if (matches.length > 1) return null;
        if (!response.hasMore) {
          if (matches.length !== 1) return null;
          const t = matches[0];
          if (typeof t.id !== 'string' || !Number.isFinite(t.value) || t.value <= 0) return null;
          const cents = Math.round(t.value * 100);
          if (!Number.isSafeInteger(cents) || Math.abs(cents - t.value * 100) > 0.000001) return null;
          return {
            found: true,
            providerTransferId: t.id,
            providerStatus: t.status,
            amountCents: BigInt(cents),
            externalReference: t.externalReference,
          };
        }
      }
      // More pages exist: do not claim a result from an incomplete history.
      return null;
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
      if (err.name === 'AbortError') {
        return { success: false, errorCode: 'TIMEOUT', errorMessage: 'Request timed out', isTimeout: true };
      }
      // A rejected HTTP response after POST is not independent evidence
      // that Asaas did NOT create a transfer/bill. Reconcile rather than
      // releasing a reservation or automatically retrying.
      return {
        success: false,
        errorCode: `HTTP_${err.status ?? 'UNKNOWN'}`,
        errorMessage: err.message,
        isDefinitiveFailure: false,
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
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('INVALID_ASAAS_EVENT');
    }
    const data = input as Record<string, unknown>;
    const eventName = typeof data.event === 'string' ? data.event.toUpperCase() : '';
    const category = eventName.startsWith('TRANSFER_') ? 'TRANSFER'
      : eventName.startsWith('BILL_') ? 'BILL_PAYMENT' : null;
    if (!category || typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) {
      throw new Error('INVALID_ASAAS_EVENT');
    }

    const entityValue = category === 'TRANSFER' ? data.transfer : data.bill;
    if (!entityValue || typeof entityValue !== 'object' || Array.isArray(entityValue)) {
      throw new Error('INVALID_ASAAS_EVENT_ENTITY');
    }
    const entity = entityValue as Record<string, unknown>;
    if (typeof entity.id !== 'string' || !entity.id.trim()) {
      throw new Error('INVALID_ASAAS_PAYOUT_ID');
    }

    let eventType: NormalizedProviderEvent['eventType'] = 'UNKNOWN';
    if (eventName === 'TRANSFER_DONE' || eventName === 'BILL_PAID') eventType = 'DONE';
    else if (eventName === 'TRANSFER_FAILED' || eventName === 'BILL_FAILED') eventType = 'FAILED';
    else if (eventName === 'TRANSFER_CANCELLED' || eventName === 'BILL_CANCELLED') eventType = 'CANCELLED';
    else if (eventName === 'TRANSFER_IN_BANK_PROCESSING' || eventName === 'BILL_BANK_PROCESSING') eventType = 'PROCESSING';
    else if (eventName === 'TRANSFER_CREATED' || eventName === 'TRANSFER_PENDING' ||
             eventName === 'BILL_CREATED' || eventName === 'BILL_PENDING') eventType = 'PENDING';

    const amount = entity.value;
    const amountNumber = typeof amount === 'number' ? amount : NaN;
    const cents = Math.round(amountNumber * 100);
    const hasAmount = Number.isFinite(amountNumber) && Number.isSafeInteger(cents) &&
      Math.abs(amountNumber * 100 - cents) < 0.000001 && cents > 0;
    if (amount !== undefined && amount !== null && !hasAmount) {
      throw new Error('INVALID_ASAAS_AMOUNT');
    }
    const ref = typeof entity.externalReference === 'string' ? entity.externalReference : undefined;
    // Persist an explicit allowlist only. The original transfer/bill payload can
    // contain recipient CPF, Pix key, bank account or other personal data.
    const safeEntity = {
      id: entity.id, status: typeof entity.status === 'string' ? entity.status : undefined,
      value: hasAmount ? amountNumber : undefined, externalReference: ref,
    };
    return {
      providerEventId: data.id,
      providerPayoutId: entity.id,
      eventCategory: category,
      eventType,
      amountCents: hasAmount ? BigInt(cents) : undefined,
      externalReference: ref,
      raw: { id: data.id, event: eventName, [category === 'TRANSFER' ? 'transfer' : 'bill']: safeEntity },
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
