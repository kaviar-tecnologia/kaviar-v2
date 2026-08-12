import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

import { getFinanceDueObligations } from '../src/services/ai/kaviar-ai.tools';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

describe('getFinanceDueObligations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna contagens e totais com obrigações pendentes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 5,
        total_amount_cents: '125000',
        overdue_count: 1,
        overdue_amount_cents: '30000',
        due_soon_count: 2,
        due_soon_amount_cents: '50000',
      }],
    });

    const result = await getFinanceDueObligations();

    expect(result.tool).toBe('finance_due_obligations');
    expect(result.data.totalPending).toBe(5);
    expect(result.data.totalAmountCents).toBe('125000');
    expect(result.data.overdueCount).toBe(1);
    expect(result.data.overdueAmountCents).toBe('30000');
    expect(result.data.dueSoonCount).toBe(2);
    expect(result.data.dueSoonAmountCents).toBe('50000');
  });

  it('retorna zeros quando não há obrigações pendentes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 0,
        total_amount_cents: '0',
        overdue_count: 0,
        overdue_amount_cents: '0',
        due_soon_count: 0,
        due_soon_amount_cents: '0',
      }],
    });

    const result = await getFinanceDueObligations();

    expect(result.data.totalPending).toBe(0);
    expect(result.data.totalAmountCents).toBe('0');
    expect(result.data.overdueCount).toBe(0);
    expect(result.data.dueSoonCount).toBe(0);
  });

  it('lida com resultado vazio (rows[])', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getFinanceDueObligations();

    expect(result.data.totalPending).toBe(0);
    expect(result.data.totalAmountCents).toBe('0');
    expect(result.data.overdueCount).toBe(0);
    expect(result.data.overdueAmountCents).toBe('0');
    expect(result.data.dueSoonCount).toBe(0);
    expect(result.data.dueSoonAmountCents).toBe('0');
  });

  it('preserva valores grandes como string BigInt', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 100,
        total_amount_cents: '99999999999',
        overdue_count: 10,
        overdue_amount_cents: '50000000000',
        due_soon_count: 5,
        due_soon_amount_cents: '25000000000',
      }],
    });

    const result = await getFinanceDueObligations();

    expect(result.data.totalAmountCents).toBe('99999999999');
    expect(result.data.overdueAmountCents).toBe('50000000000');
    expect(result.data.dueSoonAmountCents).toBe('25000000000');
  });
});

describe('askKaviarAi — finance_due_obligations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responde sobre obrigações financeiras pendentes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 3,
        total_amount_cents: '125000',
        overdue_count: 1,
        overdue_amount_cents: '30000',
        due_soon_count: 2,
        due_soon_amount_cents: '50000',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais obrigações financeiras estão pendentes?',
    });

    expect(response.toolsUsed).toContain('finance_due_obligations');
    expect(response.answer).toContain('3 obrigações pendentes');
    expect(response.answer).toContain('R$ 1.250,00');
    expect(response.answer).toContain('1 está vencida');
    expect(response.answer).toContain('R$ 300,00');
    expect(response.answer).toContain('2 vencem nos próximos 7 dias');
    expect(response.answer).toContain('R$ 500,00');
  });

  it('responde "Tem conta vencida?"', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 2,
        total_amount_cents: '80000',
        overdue_count: 2,
        overdue_amount_cents: '80000',
        due_soon_count: 0,
        due_soon_amount_cents: '0',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Tem conta vencida?',
    });

    expect(response.toolsUsed).toContain('finance_due_obligations');
    expect(response.answer).toContain('2 obrigações pendentes');
    expect(response.answer).toContain('2 estão vencidas');
    expect(response.answer).not.toContain('próximos 7 dias');
  });

  it('responde "O que vence esta semana?"', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 4,
        total_amount_cents: '200000',
        overdue_count: 0,
        overdue_amount_cents: '0',
        due_soon_count: 3,
        due_soon_amount_cents: '150000',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'O que vence esta semana em pagamentos?',
    });

    expect(response.toolsUsed).toContain('finance_due_obligations');
    expect(response.answer).toContain('3 vencem nos próximos 7 dias');
    expect(response.answer).not.toContain('vencida');
  });

  it('responde "Quanto temos a pagar nos próximos 7 dias?"', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 1,
        total_amount_cents: '75050',
        overdue_count: 0,
        overdue_amount_cents: '0',
        due_soon_count: 1,
        due_soon_amount_cents: '75050',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quanto temos a pagar nos próximos 7 dias?',
    });

    expect(response.toolsUsed).toContain('finance_due_obligations');
    expect(response.answer).toContain('R$ 750,50');
    expect(response.answer).toContain('1 obrigação pendente');
  });

  it('responde quando não há obrigações pendentes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 0,
        total_amount_cents: '0',
        overdue_count: 0,
        overdue_amount_cents: '0',
        due_soon_count: 0,
        due_soon_amount_cents: '0',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais obrigações financeiras estão pendentes?',
    });

    expect(response.toolsUsed).toContain('finance_due_obligations');
    expect(response.answer).toContain('Não há obrigações financeiras pendentes');
  });

  it('NÃO aciona para documentos de motorista pendentes', async () => {
    // Mock para getDriversDocumentsPending (3 queries)
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'SUBMITTED', driver_count: 2 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 2 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quantos motoristas têm documentos pendentes?',
    });

    expect(response.toolsUsed).not.toContain('finance_due_obligations');
    expect(response.toolsUsed).toContain('drivers_documents_pending');
  });

  it('NÃO aciona para perguntas de corridas', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 5, gross_total: '250.00', platform_fee_total: '25.00' }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quanto o KAVIAR ganhou hoje?',
    });

    expect(response.toolsUsed).not.toContain('finance_due_obligations');
    expect(response.toolsUsed).toContain('rides_summary_today');
  });

  it('NÃO aciona para "Quais documentos estão pendentes?"', async () => {
    // Essa pergunta tem "documento" + "pendente" → aciona drivers_documents_pending
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'SUBMITTED', driver_count: 1 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 1 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais documentos estão pendentes?',
    });

    expect(response.toolsUsed).not.toContain('finance_due_obligations');
    expect(response.toolsUsed).toContain('drivers_documents_pending');
  });

  it('NÃO aciona para "Tem motorista aguardando aprovação?"', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'SUBMITTED', driver_count: 1 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 1 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Tem motorista aguardando aprovação?',
    });

    expect(response.toolsUsed).not.toContain('finance_due_obligations');
  });

  it('formata valor singular corretamente', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 1,
        total_amount_cents: '100',
        overdue_count: 1,
        overdue_amount_cents: '100',
        due_soon_count: 0,
        due_soon_amount_cents: '0',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais contas estão a pagar vencidas?',
    });

    expect(response.answer).toContain('1 obrigação pendente');
    expect(response.answer).toContain('R$ 1,00');
    expect(response.answer).toContain('1 está vencida');
  });
});
