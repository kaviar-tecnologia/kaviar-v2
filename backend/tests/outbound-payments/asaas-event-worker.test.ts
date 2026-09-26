import { beforeEach, describe, expect, it, vi } from 'vitest';

const processEventMock = vi.fn();
vi.mock('../../src/services/finance/outbound-payments/event-processor', () => ({
  processProviderEvent: (...args: any[]) => processEventMock(...args),
}));
const { processEventBatch } = await import('../../src/services/finance/outbound-payments/event-worker');

function makePool() {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const event = {
    id: 'row-1', provider_name: 'asaas', provider_event_id: 'evt-1',
    event_category: 'TRANSFER', event_type: 'DONE', processing_attempts: 0,
    payload_safe: {
      id: 'evt-1', event: 'TRANSFER_DONE',
      transfer: { id: 'transfer-1', status: 'DONE', value: 20, externalReference: 'kaviar-payment:test:obl-1' },
    },
  };
  const query = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT id, provider_name, provider_event_id')) {
      return { rows: [event] };
    }
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release: () => {} }) } as any;
  return { pool, calls };
}

describe('Asaas persisted event worker', () => {
  beforeEach(() => { processEventMock.mockReset(); });

  it('processes a pre-persisted PENDING event rather than treating it as a duplicate', async () => {
    const { pool, calls } = makePool();
    processEventMock.mockResolvedValueOnce({ processed: true, duplicate: false });
    const count = await processEventBatch({ pool, ledgerService: {} as any });
    expect(count).toBe(1);
    expect(processEventMock).toHaveBeenCalledOnce();
    expect(processEventMock.mock.calls[0][1]).toMatchObject({
      providerEventId: 'evt-1', providerPayoutId: 'transfer-1', eventType: 'DONE', amountCents: 2000n,
    });
    expect(calls.some(c => c.sql.includes("processing_status = 'PROCESSING'") && c.sql.includes('15 minutes'))).toBe(true);
    expect(calls.some(c => c.sql.includes('SET processing_status = $2') && c.params[1] === 'PROCESSED')).toBe(true);
  });

  it('does not mark unknown payout as PROCESSED; retries safely', async () => {
    const { pool, calls } = makePool();
    processEventMock.mockResolvedValueOnce({ processed: false, duplicate: false });
    const count = await processEventBatch({ pool, ledgerService: {} as any });
    expect(count).toBe(0);
    expect(calls.some(c => c.sql.includes("processing_status = 'FAILED_RETRYABLE'"))).toBe(true);
    expect(calls.some(c => c.sql.includes('SET processing_status = $2') && c.params[1] === 'PROCESSED')).toBe(false);
  });
});
