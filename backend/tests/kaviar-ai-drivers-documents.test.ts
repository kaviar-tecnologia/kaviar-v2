import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

import { getDriversDocumentsPending } from '../src/services/ai/kaviar-ai.tools';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

describe('getDriversDocumentsPending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna contagem correta com documentos pendentes', async () => {
    // Query 1: status summary
    mockQuery.mockResolvedValueOnce({
      rows: [
        { status: 'MISSING', driver_count: 3 },
        { status: 'SUBMITTED', driver_count: 2 },
      ],
    });
    // Query 2: compliance pending
    mockQuery.mockResolvedValueOnce({
      rows: [{ pending_count: 1 }],
    });
    // Query 3: total drivers
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_drivers: 4 }],
    });

    const result = await getDriversDocumentsPending();

    expect(result.tool).toBe('drivers_documents_pending');
    expect(result.data.driversAffected).toBe(4);
    expect(result.data.summary).toEqual({ MISSING: 3, SUBMITTED: 2 });
    expect(result.data.compliancePending).toBe(1);
  });

  it('retorna zero quando não há documentos pendentes', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 0 }] });

    const result = await getDriversDocumentsPending();

    expect(result.data.driversAffected).toBe(0);
    expect(result.data.summary).toEqual({});
    expect(result.data.compliancePending).toBe(0);
  });

  it('lida com resultado nulo na query de total', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getDriversDocumentsPending();

    expect(result.data.driversAffected).toBe(0);
    expect(result.data.compliancePending).toBe(0);
  });
});

describe('askKaviarAi — drivers_documents_pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responde sobre documentos pendentes de motoristas', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { status: 'SUBMITTED', driver_count: 3 },
        { status: 'MISSING', driver_count: 1 },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 4 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quantos motoristas têm documentos pendentes?',
    });

    expect(response.toolsUsed).toContain('drivers_documents_pending');
    expect(response.answer).toContain('4 motoristas');
    expect(response.answer).toContain('SUBMITTED: 3');
    expect(response.answer).toContain('MISSING: 1');
  });

  it('responde quando não há pendências', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 0 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Tem motorista aguardando aprovação de documentos?',
    });

    expect(response.toolsUsed).toContain('drivers_documents_pending');
    expect(response.answer).toContain('Nenhum motorista');
  });

  it('inclui compliance pendente na resposta', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'SUBMITTED', driver_count: 2 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 3 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 2 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais documentos dos motoristas estão pendentes?',
    });

    expect(response.toolsUsed).toContain('drivers_documents_pending');
    expect(response.answer).toContain('2 motoristas com documentos pendentes');
    expect(response.answer).toContain('3 motoristas com documento de compliance aguardando aprovação');
  });

  it('aciona com "documento" + "pendente" (sem "motorista")', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'SUBMITTED', driver_count: 1 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 1 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Há documentos pendentes de aprovação?',
    });

    expect(response.toolsUsed).toContain('drivers_documents_pending');
  });

  it('não aciona para perguntas de corridas', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 5, gross_total: '250.00', platform_fee_total: '25.00' }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quanto ganhou hoje?',
    });

    expect(response.toolsUsed).not.toContain('drivers_documents_pending');
    expect(response.toolsUsed).toContain('rides_summary_today');
  });

  it('NÃO aciona para obrigações financeiras pendentes', async () => {
    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais obrigações financeiras estão pendentes?',
    });

    expect(response.toolsUsed).not.toContain('drivers_documents_pending');
    expect(response.answer).toContain('Ainda não sei responder');
  });

  it('NÃO aciona para pagamento aguardando aprovação', async () => {
    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Tem pagamento aguardando aprovação?',
    });

    expect(response.toolsUsed).not.toContain('drivers_documents_pending');
    expect(response.answer).toContain('Ainda não sei responder');
  });

  it('NÃO aciona para contas pendentes', async () => {
    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais contas estão pendentes?',
    });

    expect(response.toolsUsed).not.toContain('drivers_documents_pending');
    expect(response.answer).toContain('Ainda não sei responder');
  });

  it('retorna fallback para perguntas não reconhecidas', async () => {
    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Qual é o clima hoje?',
    });

    expect(response.toolsUsed).toHaveLength(0);
    expect(response.answer).toContain('Ainda não sei responder');
  });
});
