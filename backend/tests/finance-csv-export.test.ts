/**
 * Tests for Frente 5/9 — Finance Transaction CSV Export
 *
 * Covers:
 * - bigIntCentsToDecimal: zero, positive, negative, huge values
 * - formatCivilDateBR: no timezone shift, various formats
 * - formatTimestampBR: America/Sao_Paulo timezone
 * - csvSafe: injection mitigation, quotes, special chars
 * - buildCsvRow: correct column count, field mapping
 * - buildCsvContent: BOM, separator, header, encoding
 * - HTTP route: auth, filters, limit exceeded, empty results
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Unit tests (no mocks needed) ─────────────────────────────────────────────

const {
  bigIntCentsToDecimal,
  formatCivilDateBR,
  formatTimestampBR,
  csvSafe,
  buildCsvRow,
  buildCsvContent,
  CSV_HEADERS,
  CSV_EXPORT_MAX_ROWS,
} = await import('../src/services/finance/finance-csv-export');

// ══════════════════════════════════════════════════════════════════════════════
// 1. bigIntCentsToDecimal
// ══════════════════════════════════════════════════════════════════════════════

describe('bigIntCentsToDecimal', () => {
  it('0n → "0,00"', () => {
    expect(bigIntCentsToDecimal(BigInt(0))).toBe('0,00');
  });

  it('1n → "0,01"', () => {
    expect(bigIntCentsToDecimal(BigInt(1))).toBe('0,01');
  });

  it('10n → "0,10"', () => {
    expect(bigIntCentsToDecimal(BigInt(10))).toBe('0,10');
  });

  it('100n → "1,00"', () => {
    expect(bigIntCentsToDecimal(BigInt(100))).toBe('1,00');
  });

  it('12345n → "123,45"', () => {
    expect(bigIntCentsToDecimal(BigInt(12345))).toBe('123,45');
  });

  it('123456n → "1234,56"', () => {
    expect(bigIntCentsToDecimal(BigInt(123456))).toBe('1234,56');
  });

  it('-12345n → "-123,45"', () => {
    expect(bigIntCentsToDecimal(BigInt(-12345))).toBe('-123,45');
  });

  it('-1n → "-0,01"', () => {
    expect(bigIntCentsToDecimal(BigInt(-1))).toBe('-0,01');
  });

  it('null → ""', () => {
    expect(bigIntCentsToDecimal(null)).toBe('');
  });

  it('undefined → ""', () => {
    expect(bigIntCentsToDecimal(undefined)).toBe('');
  });

  it('string "12345" → "123,45"', () => {
    expect(bigIntCentsToDecimal('12345')).toBe('123,45');
  });

  it('value above Number.MAX_SAFE_INTEGER', () => {
    // 9007199254740993n (MAX_SAFE_INTEGER + 2)
    const huge = BigInt('9007199254740993');
    expect(bigIntCentsToDecimal(huge)).toBe('90071992547409,93');
  });

  it('very large negative value', () => {
    const huge = BigInt('-9007199254740993');
    expect(bigIntCentsToDecimal(huge)).toBe('-90071992547409,93');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. formatCivilDateBR
// ══════════════════════════════════════════════════════════════════════════════

describe('formatCivilDateBR', () => {
  it('Date object 2026-08-01T00:00:00Z → "01/08/2026"', () => {
    expect(formatCivilDateBR(new Date('2026-08-01T00:00:00.000Z'))).toBe('01/08/2026');
  });

  it('ISO string "2026-01-15" → "15/01/2026"', () => {
    expect(formatCivilDateBR('2026-01-15')).toBe('15/01/2026');
  });

  it('ISO string "2026-12-31T00:00:00.000Z" → "31/12/2026"', () => {
    expect(formatCivilDateBR('2026-12-31T00:00:00.000Z')).toBe('31/12/2026');
  });

  it('null → ""', () => {
    expect(formatCivilDateBR(null)).toBe('');
  });

  it('undefined → ""', () => {
    expect(formatCivilDateBR(undefined)).toBe('');
  });

  it('does NOT shift date by timezone (midnight UTC stays same day)', () => {
    // This is the critical test: a date stored as 2026-02-28T00:00:00Z
    // must remain 28/02/2026, not shift to 27/02/2026
    const date = new Date('2026-02-28T00:00:00.000Z');
    expect(formatCivilDateBR(date)).toBe('28/02/2026');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. formatTimestampBR
// ══════════════════════════════════════════════════════════════════════════════

describe('formatTimestampBR', () => {
  it('formats a timestamp in America/Sao_Paulo', () => {
    // 2026-08-01T15:30:00Z = 2026-08-01 12:30 BRT (UTC-3)
    const result = formatTimestampBR(new Date('2026-08-01T15:30:00.000Z'));
    expect(result).toBe('01/08/2026 12:30');
  });

  it('null → ""', () => {
    expect(formatTimestampBR(null)).toBe('');
  });

  it('string ISO → formatted', () => {
    const result = formatTimestampBR('2026-12-25T23:59:00.000Z');
    // UTC-3 → 20:59
    expect(result).toBe('25/12/2026 20:59');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. csvSafe — CSV injection mitigation
// ══════════════════════════════════════════════════════════════════════════════

describe('csvSafe', () => {
  it('null → ""', () => {
    expect(csvSafe(null)).toBe('');
  });

  it('undefined → ""', () => {
    expect(csvSafe(undefined)).toBe('');
  });

  it('normal string → unchanged', () => {
    expect(csvSafe('Hello world')).toBe('Hello world');
  });

  it('string with quotes → doubled', () => {
    expect(csvSafe('He said "hi"')).toBe('He said ""hi""');
  });

  it('starts with = → prefixed with apostrophe', () => {
    expect(csvSafe('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });

  it('starts with + → prefixed with apostrophe', () => {
    expect(csvSafe('+1234')).toBe("'+1234");
  });

  it('starts with - → prefixed with apostrophe', () => {
    expect(csvSafe('-1234')).toBe("'-1234");
  });

  it('starts with @ → prefixed with apostrophe', () => {
    expect(csvSafe('@email.com')).toBe("'@email.com");
  });

  it('starts with tab → prefixed with apostrophe', () => {
    expect(csvSafe('\tdata')).toBe("'\tdata");
  });

  it('string with semicolons is safe (quoting happens at field level)', () => {
    expect(csvSafe('value;with;semicolons')).toBe('value;with;semicolons');
  });

  it('boolean true → "true"', () => {
    expect(csvSafe(true)).toBe('true');
  });

  it('number 0 → "0"', () => {
    expect(csvSafe(0)).toBe('0');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. buildCsvRow — column count and field mapping
// ══════════════════════════════════════════════════════════════════════════════

describe('buildCsvRow', () => {
  const mockRow = {
    id: 'txn-001',
    status: 'POSTED',
    source_type: 'MANUAL',
    description: 'AWS agosto',
    memo: 'Nota fiscal #123',
    external_reference: 'NF-2026-001',
    direction: 'OUT',
    transaction_type: 'EXPENSE',
    account: { code: 'BANK-01', name: 'Conta Corrente' },
    category: {
      code: 'AWS',
      name: 'AWS',
      accounting_code: '3.1.01.01',
      accounting_nature: 'DEBIT',
      dre_group: 'Custos Operacionais',
      balance_sheet_group: null,
      fiscal_classification: 'CFOP 5102',
      deductible: true,
      export_code: 'EXP-AWS',
      accountant_notes: 'Verificado',
    },
    cost_center: { code: 'TECH', name: 'Tecnologia' },
    competence_date: new Date('2026-08-01T00:00:00.000Z'),
    transaction_date: new Date('2026-08-05T00:00:00.000Z'),
    due_date: new Date('2026-08-15T00:00:00.000Z'),
    settlement_date: new Date('2026-08-10T00:00:00.000Z'),
    gross_amount_cents: BigInt(15000),
    fee_amount_cents: BigInt(0),
    discount_amount_cents: BigInt(0),
    retention_amount_cents: BigInt(0),
    net_amount_cents: BigInt(15000),
    payment_method: 'PIX',
    canceled_reason: null,
    created_at: new Date('2026-08-01T10:00:00.000Z'),
    updated_at: new Date('2026-08-05T12:00:00.000Z'),
  };

  it('produces correct number of columns matching headers', () => {
    const row = buildCsvRow(mockRow);
    expect(row).toHaveLength(CSV_HEADERS.length);
  });

  it('maps ID correctly', () => {
    const row = buildCsvRow(mockRow);
    expect(row[0]).toBe('txn-001');
  });

  it('maps accounting_code from category', () => {
    const row = buildCsvRow(mockRow);
    expect(row[12]).toBe('3.1.01.01'); // Código contábil
  });

  it('maps dre_group from category', () => {
    const row = buildCsvRow(mockRow);
    expect(row[14]).toBe('Custos Operacionais'); // Grupo DRE
  });

  it('maps deductible as Sim/Não', () => {
    const row = buildCsvRow(mockRow);
    expect(row[17]).toBe('Sim'); // Dedutível
  });

  it('formats BigInt monetary value as decimal', () => {
    const row = buildCsvRow(mockRow);
    expect(row[25]).toBe('150,00'); // Valor bruto
  });

  it('formats civil dates as DD/MM/YYYY', () => {
    const row = buildCsvRow(mockRow);
    expect(row[21]).toBe('01/08/2026'); // Data competência
    expect(row[22]).toBe('05/08/2026'); // Data transação
  });

  it('handles null fields gracefully', () => {
    const row = buildCsvRow({ ...mockRow, category: null, cost_center: null, memo: null });
    expect(row[10]).toBe(''); // Categoria name
    expect(row[4]).toBe(''); // Observação
    expect(row[20]).toBe(''); // Centro de custo
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. buildCsvContent — BOM, separator, structure
// ══════════════════════════════════════════════════════════════════════════════

describe('buildCsvContent', () => {
  it('starts with BOM', () => {
    const csv = buildCsvContent([]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('uses semicolon separator', () => {
    const csv = buildCsvContent([]);
    const headerLine = csv.split('\r\n')[0];
    expect(headerLine).toContain(';');
    expect(headerLine).not.toMatch(/(?<!")(?:,)(?!")/); // no bare commas as separator
  });

  it('header line contains all expected columns', () => {
    const csv = buildCsvContent([]);
    for (const header of CSV_HEADERS) {
      expect(csv).toContain(header);
    }
  });

  it('each field is quoted', () => {
    const mockRow = {
      id: 'test', status: 'DRAFT', source_type: 'MANUAL', description: 'Test',
      memo: null, external_reference: null, direction: 'IN', transaction_type: 'INCOME',
      account: { code: 'A', name: 'Acc' }, category: null, cost_center: null,
      competence_date: '2026-01-01', transaction_date: '2026-01-01',
      due_date: null, settlement_date: null,
      gross_amount_cents: BigInt(100), fee_amount_cents: BigInt(0),
      discount_amount_cents: BigInt(0), retention_amount_cents: BigInt(0),
      net_amount_cents: BigInt(100), payment_method: null, canceled_reason: null,
      created_at: new Date('2026-01-01T10:00:00Z'), updated_at: new Date('2026-01-01T10:00:00Z'),
    };
    const csv = buildCsvContent([mockRow]);
    const dataLine = csv.split('\r\n')[1];
    // All fields should be quoted
    const fields = dataLine.split(';');
    for (const field of fields) {
      expect(field.startsWith('"')).toBe(true);
      expect(field.endsWith('"')).toBe(true);
    }
  });

  it('uses CRLF line endings', () => {
    const csv = buildCsvContent([]);
    expect(csv).toContain('\r\n');
  });

  it('handles empty rows (header only)', () => {
    const csv = buildCsvContent([]);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(1); // just header
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. HTTP Route Tests
// ══════════════════════════════════════════════════════════════════════════════

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    financial_transactions: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(prismaMock)),
  };
  return { prismaMock, authState: { admin: { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' } as any } };
});

vi.mock('../src/utils/audit', () => ({
  audit: vi.fn(),
  auditCtx: () => ({ adminId: 'sa-1', adminEmail: 'sa@t.l', ip: '127.0.0.1', ua: 'test' }),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { req.admin = authState.admin; next(); },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    if (!['SUPER_ADMIN', 'FINANCE'].includes(req.admin?.role)) return res.status(403).json({ success: false });
    next();
  },
}));

const { default: routes } = await import('../src/routes/admin-finance');
const app = express();
app.use(express.json());
app.use('/api/admin/finance', routes);

describe('GET /api/admin/finance/transactions/export.csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.admin = { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' };
    prismaMock.financial_transactions.count.mockResolvedValue(0);
    prismaMock.financial_transactions.findMany.mockResolvedValue([]);
  });

  it('returns 200 with CSV content-type', async () => {
    const res = await request(app).get('/api/admin/finance/transactions/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('returns Content-Disposition header for download', async () => {
    const res = await request(app).get('/api/admin/finance/transactions/export.csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('kaviar-lancamentos.csv');
  });

  it('starts with BOM', async () => {
    const res = await request(app).get('/api/admin/finance/transactions/export.csv');
    expect(res.text.charCodeAt(0)).toBe(0xFEFF);
  });

  it('returns 422 when limit exceeded', async () => {
    prismaMock.financial_transactions.count.mockResolvedValue(5001);

    const res = await request(app).get('/api/admin/finance/transactions/export.csv');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CSV_ROW_LIMIT_EXCEEDED');
    expect(res.body.max).toBe(5000);
    expect(res.body.total).toBe(5001);
  });

  it('passes filters through query params', async () => {
    const res = await request(app)
      .get('/api/admin/finance/transactions/export.csv')
      .query({ status: 'POSTED', direction: 'OUT' });
    expect(res.status).toBe(200);
    // Verify the count was called (filter was passed through)
    expect(prismaMock.financial_transactions.count).toHaveBeenCalled();
  });

  it('returns 403 for unauthorized role', async () => {
    authState.admin = { id: 'op-1', email: 'op@t.l', role: 'OPERATOR' };
    const res = await request(app).get('/api/admin/finance/transactions/export.csv');
    expect(res.status).toBe(403);
  });

  it('FINANCE role can export', async () => {
    authState.admin = { id: 'fin-1', email: 'fin@t.l', role: 'FINANCE' };
    const res = await request(app).get('/api/admin/finance/transactions/export.csv');
    expect(res.status).toBe(200);
  });

  it('CSV with data rows contains semicolons', async () => {
    prismaMock.financial_transactions.count.mockResolvedValue(1);
    prismaMock.financial_transactions.findMany.mockResolvedValue([{
      id: 'txn-1', status: 'DRAFT', source_type: 'MANUAL', description: 'Test',
      memo: null, external_reference: null, direction: 'IN', transaction_type: 'INCOME',
      account: { code: 'A', name: 'Acc' }, category: null, cost_center: null,
      competence_date: new Date('2026-01-01T00:00:00Z'), transaction_date: new Date('2026-01-01T00:00:00Z'),
      due_date: null, settlement_date: null,
      gross_amount_cents: BigInt(100), fee_amount_cents: BigInt(0),
      discount_amount_cents: BigInt(0), retention_amount_cents: BigInt(0),
      net_amount_cents: BigInt(100), payment_method: null, canceled_reason: null,
      created_at: new Date('2026-01-01T10:00:00Z'), updated_at: new Date('2026-01-01T10:00:00Z'),
    }]);

    const res = await request(app).get('/api/admin/finance/transactions/export.csv');
    expect(res.status).toBe(200);
    const lines = res.text.split('\r\n').filter(Boolean);
    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[1]).toContain(';');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. CSV_EXPORT_MAX_ROWS constant
// ══════════════════════════════════════════════════════════════════════════════

describe('CSV_EXPORT_MAX_ROWS', () => {
  it('is 5000', () => {
    expect(CSV_EXPORT_MAX_ROWS).toBe(5000);
  });
});
