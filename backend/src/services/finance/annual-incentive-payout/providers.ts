/**
 * Payout Provider implementations.
 *
 * FakeAnnualIncentivePayoutProvider — for local tests only
 * UnavailableAnnualIncentivePayoutProvider — blocks all payouts when provider capability unconfirmed
 *
 * SAFETY: FakeProvider CANNOT be enabled in production.
 */

import {
  AnnualIncentivePayoutProvider,
  CreateAnnualIncentivePayoutInput,
  CreateAnnualIncentivePayoutResult,
  GetAnnualIncentivePayoutResult,
  NormalizedAnnualIncentivePayoutEvent,
  PayoutProviderAvailability,
  PAYOUT_ERRORS,
} from './types';

// ─── Safety Guard ─────────────────────────────────────────────────────────────

function assertFakeAllowed(): void {
  const nodeEnv = process.env.NODE_ENV ?? '';
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    throw Object.assign(
      new Error(`FakeProvider cannot be used in ${nodeEnv}`),
      { code: PAYOUT_ERRORS.FAKE_PROVIDER_IN_PRODUCTION }
    );
  }

  // Check database URL is local
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      const hostname = parsed.hostname;
      const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
      if (!isLocal) {
        throw Object.assign(
          new Error('FakeProvider cannot be used with remote database'),
          { code: PAYOUT_ERRORS.FAKE_PROVIDER_IN_PRODUCTION }
        );
      }
      if (/rds\.amazonaws\.com/i.test(hostname)) {
        throw Object.assign(
          new Error('FakeProvider cannot be used with RDS'),
          { code: PAYOUT_ERRORS.FAKE_PROVIDER_IN_PRODUCTION }
        );
      }
      // Check database name contains test or dev
      const dbName = parsed.pathname?.slice(1) ?? '';
      if (dbName && !/(test|dev)/i.test(dbName)) {
        throw Object.assign(
          new Error(`FakeProvider requires database name containing "test" or "dev", got "${dbName}"`),
          { code: PAYOUT_ERRORS.FAKE_PROVIDER_IN_PRODUCTION }
        );
      }
    } catch (e: any) {
      if (e.code === PAYOUT_ERRORS.FAKE_PROVIDER_IN_PRODUCTION) throw e;
      // URL parse failure — allow if it's a connection string issue
    }
  }
}

// ─── Fake Provider (tests only) ──────────────────────────────────────────────

export type FakePayoutBehavior = 'success' | 'timeout' | 'definitive_failure' | 'temporary_failure';

export class FakeAnnualIncentivePayoutProvider implements AnnualIncentivePayoutProvider {
  readonly providerName = 'fake';

  // Test control knobs
  public behavior: FakePayoutBehavior = 'success';
  public payouts: Map<string, { status: string; amountCents: bigint; externalReference: string }> = new Map();
  public createCallCount = 0;
  public getCallCount = 0;
  public webhookEvents: NormalizedAnnualIncentivePayoutEvent[] = [];

  constructor() {
    assertFakeAllowed();
  }

  async validateAvailability(): Promise<PayoutProviderAvailability> {
    assertFakeAllowed();
    return { available: true };
  }

  async createPayout(input: CreateAnnualIncentivePayoutInput): Promise<CreateAnnualIncentivePayoutResult> {
    assertFakeAllowed();
    this.createCallCount++;

    switch (this.behavior) {
      case 'timeout':
        return {
          success: false,
          errorCode: 'TIMEOUT',
          errorMessage: 'Connection timed out',
          isTimeout: true,
          isDefinitiveFailure: false,
        };

      case 'definitive_failure':
        return {
          success: false,
          errorCode: 'ACCOUNT_NOT_FOUND',
          errorMessage: 'Destination account not found',
          isDefinitiveFailure: true,
          isTimeout: false,
        };

      case 'temporary_failure':
        return {
          success: false,
          errorCode: 'SERVICE_UNAVAILABLE',
          errorMessage: 'Service temporarily unavailable',
          isDefinitiveFailure: false,
          isTimeout: false,
        };

      case 'success':
      default: {
        const payoutId = `fake_payout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.payouts.set(payoutId, {
          status: 'PROCESSING',
          amountCents: input.amountCents,
          externalReference: input.externalReference,
        });
        return {
          success: true,
          providerPayoutId: payoutId,
          providerStatus: 'PROCESSING',
        };
      }
    }
  }

  async getPayout(providerPayoutId: string): Promise<GetAnnualIncentivePayoutResult> {
    assertFakeAllowed();
    this.getCallCount++;

    const payout = this.payouts.get(providerPayoutId);
    if (!payout) {
      return { found: false };
    }
    return {
      found: true,
      providerPayoutId,
      providerStatus: payout.status,
      amountCents: payout.amountCents,
      externalReference: payout.externalReference,
    };
  }

  async findByExternalReference(externalReference: string): Promise<GetAnnualIncentivePayoutResult | null> {
    assertFakeAllowed();
    for (const [id, p] of this.payouts) {
      if (p.externalReference === externalReference) {
        return {
          found: true,
          providerPayoutId: id,
          providerStatus: p.status,
          amountCents: p.amountCents,
          externalReference: p.externalReference,
        };
      }
    }
    return null;
  }

  normalizeWebhook(input: unknown): NormalizedAnnualIncentivePayoutEvent {
    assertFakeAllowed();
    const data = input as Record<string, unknown>;
    return {
      providerEventId: data.eventId as string ?? `fake_event_${Date.now()}`,
      providerPayoutId: data.payoutId as string ?? '',
      eventType: (data.status as NormalizedAnnualIncentivePayoutEvent['eventType']) ?? 'UNKNOWN',
      amountCents: data.amountCents != null ? BigInt(data.amountCents as string) : undefined,
      externalReference: data.externalReference as string | undefined,
      raw: data as Record<string, unknown>,
    };
  }

  // Test helpers
  simulateCompletion(providerPayoutId: string): void {
    const p = this.payouts.get(providerPayoutId);
    if (p) p.status = 'DONE';
  }

  simulateFailure(providerPayoutId: string): void {
    const p = this.payouts.get(providerPayoutId);
    if (p) p.status = 'FAILED';
  }

  reset(): void {
    this.behavior = 'success';
    this.payouts.clear();
    this.createCallCount = 0;
    this.getCallCount = 0;
    this.webhookEvents = [];
  }
}

// ─── Unavailable Provider ────────────────────────────────────────────────────

export class UnavailableAnnualIncentivePayoutProvider implements AnnualIncentivePayoutProvider {
  readonly providerName = 'unavailable';

  async validateAvailability(): Promise<PayoutProviderAvailability> {
    return {
      available: false,
      reason: PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED,
    };
  }

  async createPayout(_input: CreateAnnualIncentivePayoutInput): Promise<CreateAnnualIncentivePayoutResult> {
    return {
      success: false,
      errorCode: PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED,
      errorMessage: 'Payout provider capability not confirmed. Contact provider for PIX outbound API access.',
      isDefinitiveFailure: false,
      isTimeout: false,
    };
  }

  async getPayout(_providerPayoutId: string): Promise<GetAnnualIncentivePayoutResult> {
    return { found: false };
  }

  async findByExternalReference(_ref: string): Promise<GetAnnualIncentivePayoutResult | null> {
    return null;
  }

  normalizeWebhook(_input: unknown): NormalizedAnnualIncentivePayoutEvent {
    return {
      providerEventId: 'unavailable',
      providerPayoutId: 'unavailable',
      eventType: 'UNKNOWN',
      raw: {},
    };
  }
}

// ─── Provider Factory ────────────────────────────────────────────────────────

export function createPayoutProvider(): AnnualIncentivePayoutProvider {
  const providerName = process.env.ANNUAL_INCENTIVE_PAYOUT_PROVIDER ?? '';
  const enabled = process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED === 'true';

  // Not enabled → unavailable (no fallback to fake)
  if (!enabled) {
    return new UnavailableAnnualIncentivePayoutProvider();
  }

  // Block production/staging with fake
  const nodeEnv = process.env.NODE_ENV ?? '';
  if ((nodeEnv === 'production' || nodeEnv === 'staging') && providerName === 'fake') {
    throw Object.assign(
      new Error('FakeProvider cannot be used in production/staging'),
      { code: PAYOUT_ERRORS.FAKE_PROVIDER_IN_PRODUCTION }
    );
  }

  switch (providerName) {
    case 'fake':
      assertFakeAllowed();
      return new FakeAnnualIncentivePayoutProvider();
    case 'unavailable':
      return new UnavailableAnnualIncentivePayoutProvider();
    default:
      // Unknown or empty provider name: fail closed
      return new UnavailableAnnualIncentivePayoutProvider();
  }
}
