import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { poolQueryMock, requireAccountingAccessMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  requireAccountingAccessMock: vi.fn(),
}));

vi.mock('../src/db', () => ({
  pool: {
    query: poolQueryMock,
  },
}));

vi.mock('../src/services/accounting/accounting-documents.service', () => ({
  verifyEntityAccess: vi.fn(),
}));

vi.mock('../src/services/accounting/accounting-access.service', () => ({
  requireAccountingAccess: requireAccountingAccessMock,
  handleAccessError: vi.fn(() => false),
}));

const { accountantRidesReportRoutes } =
  await import('../src/routes/accountant-rides-report');

const app = express();

app.use((req: any, _res: any, next: any) => {
  req.accountant = { id: 'acct-test' };
  next();
});

app.use('/api/accountant/portal', accountantRidesReportRoutes);

const ENTITY_ID = '00000000-0000-0000-0000-000000000123';
const CSV_URL =
  `/api/accountant/portal/rides-report/csv?legal_entity_id=${ENTITY_ID}`;

describe('Accountant rides CSV entity isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAccountingAccessMock.mockResolvedValue({});
  });

  it('never exports rides for a non-operator legal entity', async () => {
    // entityHasRides(): legal entity exists, but is not the KAVIAR operator.
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ cnpj: '12345678000100' }],
    });

    const res = await request(app).get(CSV_URL);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: 'Esta empresa não possui operação de corridas',
    });

    expect(requireAccountingAccessMock).toHaveBeenCalledWith(
      'acct-test',
      ENTITY_ID,
      {
        scope: 'FINANCEIRO',
        permission: 'can_download',
      },
    );

    // Critical assertion: after identifying a non-operator entity,
    // no query against rides_v2 may execute.
    expect(poolQueryMock).toHaveBeenCalledTimes(1);
    expect(
      poolQueryMock.mock.calls.some(([sql]) =>
        String(sql).includes('rides_v2'),
      ),
    ).toBe(false);
  });

  it('allows CSV generation for the KAVIAR operator when rides exist', async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [{ cnpj: '67783601000199' }],
      })
      .mockResolvedValueOnce({
        rows: [{ has_rides: true }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const res = await request(app).get(CSV_URL);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('ID;Status;Data;Motorista;Passageiro');
  });
});
