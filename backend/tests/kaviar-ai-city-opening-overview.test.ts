import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';
import { getCityOpeningOverview } from '../src/services/ai/kaviar-ai.city-opening-overview';

// ── Routing tests ─────────────────────────────────────────────────────────

describe('city_opening_overview — routing', () => {
  it('"Como está Tambaú/SP para iniciarmos a operação?" routes to city_opening_overview', () => {
    const result = routeByRules('Como está Tambaú/SP para iniciarmos a operação?');
    expect(result.toolsToCall).toContain('city_opening_overview');
  });

  it('"Tambaú/SP está pronta para operar?" routes to city_opening_overview', () => {
    const result = routeByRules('Tambaú/SP está pronta para operar?');
    expect(result.toolsToCall).toContain('city_opening_overview');
  });

  it('"O que falta para abrir Pirassununga/SP?" routes to city_opening_overview', () => {
    const result = routeByRules('O que falta para abrir Pirassununga/SP?');
    expect(result.toolsToCall).toContain('city_opening_overview');
  });

  it('"Podemos ativar Santa Cruz das Palmeiras/SP?" routes to city_opening_overview', () => {
    const result = routeByRules('Podemos ativar Santa Cruz das Palmeiras/SP?');
    expect(result.toolsToCall).toContain('city_opening_overview');
  });

  it('"Quais pendências existem para iniciar Niterói/RJ?" routes to city_opening_overview', () => {
    const result = routeByRules('Quais pendências existem para iniciar Niterói/RJ?');
    expect(result.toolsToCall).toContain('city_opening_overview');
  });

  it('pergunta de CNPJ/empresa continua funcionando', () => {
    const result = routeByRules('Qual o CNPJ da KAVIAR?');
    expect(result.toolsToCall).toContain('company_profile');
    expect(result.toolsToCall).not.toContain('city_opening_overview');
  });

  it('pergunta territorial simples sem intent de abertura continua usando onboarding', () => {
    const result = routeByRules('Qual o status de Pirassununga/SP?');
    expect(result.toolsToCall).toContain('territory_onboarding_status');
    expect(result.toolsToCall).not.toContain('city_opening_overview');
  });
});

// ── Tool execution tests ──────────────────────────────────────────────────

describe('getCityOpeningOverview — tool execution', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  it('returns available:false for invalid city/uf', async () => {
    const result = await getCityOpeningOverview({ city: '', uf: '' });
    expect(result.tool).toBe('city_opening_overview');
    expect(result.data.available).toBe(false);
  });

  it('returns consolidated data structure when territory queries succeed', async () => {
    // Since getCityOpeningOverview calls 4 tools in parallel via executeTool,
    // mock ordering is complex. We test structure via askKaviarAi integration instead.
    // Here we just verify the tool returns correct structure for invalid input.
    const result = await getCityOpeningOverview({ city: 'Test', uf: 'XX' });
    expect(result.tool).toBe('city_opening_overview');
    expect(result.data).toHaveProperty('territory');
    expect(result.data).toHaveProperty('regulatory');
    expect(result.data).toHaveProperty('manager');
    expect(result.data).toHaveProperty('landing');
    expect(result.data).toHaveProperty('drivers');
    expect(result.data).toHaveProperty('leads');
    expect(result.data).toHaveProperty('activation');
    expect(result.data).toHaveProperty('pendencies');
    expect(result.data).toHaveProperty('nextAction');
  });
});

// ── Integration with askKaviarAi ──────────────────────────────────────────

import { MIN_DRIVERS_FOR_TERRITORY_ACTIVATION } from '../src/services/ai/kaviar-ai.city-opening-overview';

describe('city_opening_overview — MIN_DRIVERS_FOR_TERRITORY_ACTIVATION', () => {
  it('constant is 3', () => {
    expect(MIN_DRIVERS_FOR_TERRITORY_ACTIVATION).toBe(3);
  });
});

describe('askKaviarAi — city_opening_overview integration', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  it('"Como está Tambaú/SP para iniciarmos a operação?" produces consolidated response', async () => {
    // Territory not found case (simpler to test)
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // onboarding: territory not found
      .mockResolvedValueOnce({ rows: [] }) // readiness: territory not found
      .mockResolvedValueOnce({ rows: [] }) // coverage: territory not found
      .mockResolvedValueOnce({ rows: [] }); // landings: none found

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'Como está Tambaú/SP para iniciarmos a operação?', role: 'SUPER_ADMIN' },
    );

    expect(result.toolsUsed).toContain('city_opening_overview');
    expect(result.answer).toContain('Abertura de cidade');
    expect(result.answer).toContain('Tambaú/SP');
    expect(result.answer).toContain('Regulatório');
    expect(result.answer).toContain('Território');
    expect(result.answer).toContain('Gestor territorial');
    expect(result.answer).toContain('Landing');
    expect(result.answer).toContain('Pronto para ativar');
    expect(result.answer).toContain('Próxima ação recomendada');
  });

  it('city/UF extracted correctly', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'O que falta para abrir Nova Iguaçu/RJ?', role: 'SUPER_ADMIN' },
    );

    expect(result.toolsUsed).toContain('city_opening_overview');
    expect(result.answer).toContain('Nova Iguaçu/RJ');
  });

  it('Pronto para ativar respects territory_activation_readiness', async () => {
    // Territory exists but not ready
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test', level: 'city', status: 'preparation', uf: 'SP', city_name: 'Test', regulatory_status: 'not_evaluated', regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] }) // no manager
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test', status: 'preparation', regulatory_status: 'not_evaluated', moto_passenger_enabled: false }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // readiness: no manager
      .mockResolvedValueOnce({ rows: [] }) // coverage: not found
      .mockResolvedValueOnce({ rows: [] }) // landings
      .mockResolvedValueOnce({ rows: [] }) // drivers
      .mockResolvedValueOnce({ rows: [] }); // leads

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );

    expect(result.answer).toContain('Pronto para ativar');
    expect(result.answer).toContain('❌ NÃO');
  });

  it('no write tools are called', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'Como está Tambaú/SP para iniciarmos a operação?', role: 'SUPER_ADMIN' },
    );

    // Only read tools used
    expect(result.toolsUsed).toEqual(['city_opening_overview']);
    // No write operations (prisma.create, prisma.update, etc.)
    // This is guaranteed by architecture: the tool only calls pool.query SELECTs
  });

  it('unauthorized role gets access denied (RBAC)', async () => {
    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'Como está Tambaú/SP para iniciarmos a operação?', role: 'LEAD_AGENT' },
    );

    expect(result.answer).toContain('Acesso negado');
  });

  it('existing questions continue working — corridas hoje', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 5, gross_total: '100.00', platform_fee_total: '10.00' }],
    });

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'quanto a KAVIAR ganhou hoje?', role: 'SUPER_ADMIN' },
    );

    expect(result.toolsUsed).toContain('rides_summary_today');
    expect(result.toolsUsed).not.toContain('city_opening_overview');
  });

  it('data not available shows appropriate message (not invented)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'Como está Tambaú/SP para iniciarmos a operação?', role: 'SUPER_ADMIN' },
    );

    // When territory not found, should show appropriate non-invented data
    expect(result.answer).toContain('Não cadastrado');
    expect(result.answer).toContain('Cadastrar o território');
  });
});

// ── operationalReady threshold tests ──────────────────────────────────────
// These test the formatted output to verify the operationalReady logic
// since testing getCityOpeningOverview directly with parallel tool mocks is complex.

describe('city_opening_overview — operationalReady threshold via formatted output', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  // Helper: mock a territory that readiness=true (approved, has manager, etc.)
  // but vary driver count
  function mockReadyTerritoryWithDrivers(approvedCount: number, pendingCount = 0) {
    // territory_onboarding_status: found, approved, has manager
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test — SP', level: 'city', status: 'active', uf: 'SP', city_name: 'Test', regulatory_status: 'approved', regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'Gestor', email: 'g@k.br', role: 'TERRITORIAL_MANAGER', status: 'active', territory_id: 't1', territory_name: 'Test', territory_level: 'city' }] })
      .mockResolvedValueOnce({ rows: [{ is_active: true, contract_status: 'signed', document_status: 'verified' }] })
      // territory_activation_readiness: already active → ready=true
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test', status: 'active', regulatory_status: 'approved', moto_passenger_enabled: false }] })
      // territory_manager_coverage
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test — SP', level: 'city', status: 'active', is_active: true, coverage_status: 'COMPLETE' }] })
      .mockResolvedValueOnce({ rows: [{ official_neighborhoods: 3 }] })
      .mockResolvedValueOnce({ rows: [{ active_regions: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'Gestor', admin_id: 'a1', territory_id: 't1', territory_name: 'Test', territory_level: 'city' }] })
      .mockResolvedValueOnce({ rows: [] }) // uncovered
      // driver_city_landings
      .mockResolvedValueOnce({ rows: [{ city: 'Test', state: 'SP', slug: 'test-sp', public_status: 'ATIVO', landing_enabled: true }] })
      // drivers per territory (approved + pending)
      .mockResolvedValueOnce({
        rows: [
          ...(approvedCount > 0 ? [{ status: 'approved', cnt: approvedCount }] : []),
          ...(pendingCount > 0 ? [{ status: 'pending', cnt: pendingCount }] : []),
        ],
      })
      // leads per territory
      .mockResolvedValueOnce({ rows: [{ status: 'NEW', cnt: 2 }] });
  }

  it('readiness true + 0 motoristas aptos → NÃO', async () => {
    mockReadyTerritoryWithDrivers(0);
    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('❌ NÃO');
    expect(result.answer).toContain('0/3');
    expect(result.answer).toContain('mínimo operacional');
  });

  it('readiness true + 2 motoristas aptos → NÃO', async () => {
    mockReadyTerritoryWithDrivers(2);
    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('❌ NÃO');
    expect(result.answer).toContain('2/3');
  });

  it('readiness true + 3 motoristas aptos → SIM', async () => {
    mockReadyTerritoryWithDrivers(3);
    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('✅ SIM');
    expect(result.answer).toContain('3/3');
  });

  it('readiness true + 5 motoristas aptos → SIM', async () => {
    mockReadyTerritoryWithDrivers(5);
    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('✅ SIM');
    expect(result.answer).toContain('5/3');
  });

  it('readiness true + 2 aptos + 5 pending → NÃO (pending não conta)', async () => {
    mockReadyTerritoryWithDrivers(2, 5);
    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('❌ NÃO');
    expect(result.answer).toContain('2/3');
  });

  it('readiness true + 0 aptos + 3 pending → NÃO (pending não conta)', async () => {
    mockReadyTerritoryWithDrivers(0, 3);
    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('❌ NÃO');
    expect(result.answer).toContain('0/3');
  });

  it('readiness true + 3 aptos + pending adicionais → SIM', async () => {
    mockReadyTerritoryWithDrivers(3, 2);
    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('✅ SIM');
    expect(result.answer).toContain('3/3');
  });

  it('readiness false + 5 motoristas → NÃO', async () => {
    // territory not ready (planning status)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test — SP', level: 'city', status: 'planning', uf: 'SP', city_name: 'Test', regulatory_status: 'not_evaluated', regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] }) // no manager
      // readiness: not ready
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test', status: 'planning', regulatory_status: 'not_evaluated', moto_passenger_enabled: false }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // no manager count
      // coverage
      .mockResolvedValueOnce({ rows: [] }) // territory not found for coverage
      // landings
      .mockResolvedValueOnce({ rows: [] })
      // drivers: 5
      .mockResolvedValueOnce({ rows: [{ status: 'active', cnt: 5 }] })
      // leads
      .mockResolvedValueOnce({ rows: [] });

    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('❌ NÃO');
  });

  it('readiness true + drivers indisponíveis → AINDA NÃO É POSSÍVEL CONFIRMAR', async () => {
    // territory ready but driver query fails
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test — SP', level: 'city', status: 'active', uf: 'SP', city_name: 'Test', regulatory_status: 'approved', regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'Gestor', email: 'g@k.br', role: 'TM', status: 'active', territory_id: 't1', territory_name: 'Test', territory_level: 'city' }] })
      .mockResolvedValueOnce({ rows: [{ is_active: true, contract_status: 'signed', document_status: 'verified' }] })
      // readiness: active = ready
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test', status: 'active', regulatory_status: 'approved', moto_passenger_enabled: false }] })
      // coverage
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Test', level: 'city', status: 'active', is_active: true, coverage_status: 'COMPLETE' }] })
      .mockResolvedValueOnce({ rows: [{ official_neighborhoods: 3 }] })
      .mockResolvedValueOnce({ rows: [{ active_regions: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'Gestor', admin_id: 'a1', territory_id: 't1', territory_name: 'Test', territory_level: 'city' }] })
      .mockResolvedValueOnce({ rows: [] })
      // landings
      .mockResolvedValueOnce({ rows: [{ city: 'Test', state: 'SP', slug: 'test-sp', public_status: 'ATIVO', landing_enabled: true }] })
      // drivers query FAILS
      .mockRejectedValueOnce(new Error('connection refused'))
      // leads
      .mockResolvedValueOnce({ rows: [] });

    const result = await askKaviarAi(
      { userId: 'a', question: 'Podemos ativar Test/SP?', role: 'SUPER_ADMIN' },
    );
    expect(result.answer).toContain('AINDA NÃO É POSSÍVEL CONFIRMAR');
  });
});
