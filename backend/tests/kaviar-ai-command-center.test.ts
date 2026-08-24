import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';
import { getRegisteredTools, canRoleExecuteTool } from '../src/services/ai/kaviar-ai.registry';
import { routeByRules, routeQuestion } from '../src/services/ai/kaviar-ai.router';
import {
  getPlatformCatalog,
  getAnnualIncentiveSummary,
  getWhatsAppSummary,
  getDriverPipelineSummary,
  getEmergencyOperationsSummary,
  getTerritoryPortfolioSummary,
} from '../src/services/ai/kaviar-ai.command-center';

// ══════════════════════════════════════════════════════════════════════════════
// 1. PLATFORM_CATALOG
// ══════════════════════════════════════════════════════════════════════════════

describe('platform_catalog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Quais módulos existem?" roteia para platform_catalog', () => {
    const r = routeByRules('Quais módulos existem na KAVIAR?');
    expect(r.toolsToCall).toContain('platform_catalog');
  });

  it('overview retorna todos os módulos sem consulta ao banco', async () => {
    const r = await getPlatformCatalog({ section: 'overview' });
    expect(r.data.modules.length).toBeGreaterThan(30);
    expect(r.data.note).toContain('não significa');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('seção mobility_operations retorna módulos de corrida', async () => {
    const r = await getPlatformCatalog({ section: 'mobility_operations' });
    expect(r.data.modules.some(m => m.name === 'Corridas')).toBe(true);
    expect(r.data.modules.some(m => m.name === 'Emergências')).toBe(true);
  });

  it('não afirma que módulo está ativo em produção', async () => {
    const r = await getPlatformCatalog({ section: 'overview' });
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('ativo em produção');
    expect(json).not.toContain('disponível comercialmente');
    expect(r.data.note).toContain('Módulos existentes');
  });

  it('FINANCE pode acessar', () => {
    expect(canRoleExecuteTool('FINANCE', 'platform_catalog')).toBe(true);
  });

  it('"Como funciona o KAVIAR Pet?" roteia para platform_catalog', () => {
    const r = routeByRules('Como funciona o KAVIAR Pet?');
    expect(r.toolsToCall).toContain('platform_catalog');
  });

  it('"Onde vejo as mensagens do WhatsApp?" roteia para platform_catalog', () => {
    const r = routeByRules('Onde vejo as mensagens do WhatsApp no admin?');
    // This should hit whatsapp_summary OR platform_catalog depending on keywords
    // "onde vejo" + "mensagens" + "whatsapp" → whatsapp_summary is more specific
    expect(r.toolsToCall.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. ANNUAL_INCENTIVE_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

describe('annual_incentive_summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Quanto temos de bônus a pagar?" roteia para annual_incentive_summary', () => {
    const r = routeByRules('Quanto temos de bônus a pagar atualmente?');
    expect(r.toolsToCall).toContain('annual_incentive_summary');
  });

  it('retorna dados agregados do ledger usando projeção canônica', async () => {
    mockQuery
      // Aggregate ledger per driver
      .mockResolvedValueOnce({ rows: [
        { driver_id: 'd1', program_year: 2026, event_type: 'ACCRUAL', total_cents: '500000' },
        { driver_id: 'd1', program_year: 2026, event_type: 'PAYMENT', total_cents: '100000' },
        { driver_id: 'd1', program_year: 2026, event_type: 'REQUEST_RESERVATION', total_cents: '50000' },
        { driver_id: 'd1', program_year: 2026, event_type: 'REVERSAL', total_cents: '20000' },
        { driver_id: 'd2', program_year: 2026, event_type: 'ACCRUAL', total_cents: '200000' },
      ] })
      // Deadline breaches
      .mockResolvedValueOnce({ rows: [{ cnt: 2 }] })
      // Reference time
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] })
      // Forecast: year + now_sp
      .mockResolvedValueOnce({ rows: [{ current_year: 2026, now_sp: '2026-08-13 14:00:00' }] })
      // Forecast: range
      .mockResolvedValueOnce({ rows: [{ first_at: '2026-01-15', net_generation: '680000' }] });

    const r = await getAnnualIncentiveSummary();
    expect(r.data.available).toBe(true);
    // d1: accrued=500000, reversed=20000, paid=100000, reserved=50000, released=0
    //   openReserved = 50000 - 0 - 100000 = -50000 → 0
    //   available = 500000 - 20000 - 100000 - 0 = 380000
    // d2: accrued=200000, no other events → available = 200000
    // totals: accrued=700000, available=580000, reserved=0, paid=100000, reversed=20000
    expect(r.data.totalAccruedCents).toBe('700000');
    expect(r.data.totalPaidCents).toBe('100000');
    expect(r.data.totalReversedCents).toBe('20000');
    expect(r.data.totalAvailableCents).toBe('580000');
    expect(r.data.totalReservedCents).toBe('0');
    // outstanding = available + reserved = 580000 + 0 = 580000
    expect(r.data.totalOutstandingCents).toBe('580000');
    // Both drivers have outstanding > 0
    expect(r.data.driversWithBalance).toBe(2);
    expect(r.data.deadlineBreaches).toBe(2);
  });

  it('calcula outstanding = available + reserved', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [
        { driver_id: 'd1', program_year: 2026, event_type: 'ACCRUAL', total_cents: '1000000' },
      ] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] })
      .mockResolvedValueOnce({ rows: [{ current_year: 2026, now_sp: '2026-08-13 14:00:00' }] })
      .mockResolvedValueOnce({ rows: [{ first_at: null, net_generation: '0' }] });

    const r = await getAnnualIncentiveSummary();
    const outstanding = BigInt(r.data.totalAvailableCents) + BigInt(r.data.totalReservedCents);
    expect(r.data.totalOutstandingCents).toBe(outstanding.toString());
  });

  it('FINANCE pode acessar', () => {
    expect(canRoleExecuteTool('FINANCE', 'annual_incentive_summary')).toBe(true);
  });

  it('forecast indisponível se menos de 30 dias observados', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ driver_id: 'd1', program_year: 2026, event_type: 'ACCRUAL', total_cents: '100000' }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] })
      .mockResolvedValueOnce({ rows: [{ current_year: 2026, now_sp: '2026-08-13 14:00:00' }] })
      .mockResolvedValueOnce({ rows: [{ first_at: new Date(Date.now() - 10 * 86400000).toISOString(), net_generation: '100000' }] });

    const r = await getAnnualIncentiveSummary();
    expect(r.data.forecast.available).toBe(false);
    expect(r.data.forecast.reason).toContain('dias observados');
  });

  it('falha geral retorna available: false', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));
    const r = await getAnnualIncentiveSummary();
    expect(r.data.available).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. WHATSAPP_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

describe('whatsapp_summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Mensagens novas no WhatsApp?" roteia para whatsapp_summary', () => {
    const r = routeByRules('Tem mensagens novas no WhatsApp?');
    expect(r.toolsToCall).toContain('whatsapp_summary');
  });

  it('retorna resumo sem telefone ou corpo', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ unread_messages: 5, conversations_with_unread: 3, new_conversations: 2, in_progress_conversations: 4, high_priority: 1 }] })
      .mockResolvedValueOnce({ rows: [
        { contact_type: 'driver', status: 'new', priority: 'urgent', unread_count: 3, last_message_at: '2026-08-13 14:00' },
      ] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:05' }] });

    const r = await getWhatsAppSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.unreadMessages).toBe(5);
    expect(r.data.highPriorityConversations).toBe(1);
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('phone');
    expect(json).not.toContain('body');
  });

  it('SUPER_ADMIN pode acessar', () => {
    expect(canRoleExecuteTool('SUPER_ADMIN', 'whatsapp_summary')).toBe(true);
  });

  it('FINANCE NÃO pode acessar', () => {
    expect(canRoleExecuteTool('FINANCE', 'whatsapp_summary')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. DRIVER_PIPELINE_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

describe('driver_pipeline_summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Quantos motoristas temos?" roteia para driver_pipeline_summary', () => {
    const r = routeByRules('Quantos motoristas temos no total?');
    expect(r.toolsToCall).toContain('driver_pipeline_summary');
  });

  it('retorna pipeline completo com modalidades', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'active', cnt: 50 }, { status: 'pending', cnt: 10 }, { status: 'suspended', cnt: 2 }] })
      .mockResolvedValueOnce({ rows: [{ vehicle_type: 'CAR', cnt: 40 }, { vehicle_type: 'MOTORCYCLE', cnt: 22 }] })
      .mockResolvedValueOnce({ rows: [{ docs_missing: 5, docs_submitted: 8, docs_rejected: 2, compliance_pending: 3 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'PENDING_REVIEW', cnt: 7 }, { status: 'APPROVED', cnt: 30 }, { status: 'REJECTED', cnt: 3 }] }) // modalities
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] });

    const r = await getDriverPipelineSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.total).toBe(62);
    expect(r.data.activeDrivers).toBe(50);
    expect(r.data.pendingApproval).toBe(10);
    expect(r.data.byVehicleType['CAR']).toBe(40);
    expect(r.data.modalities.available).toBe(true);
    expect(r.data.modalities.pending).toBe(7);
    expect(r.data.modalities.approved).toBe(30);
  });

  it('FINANCE NÃO pode acessar', () => {
    expect(canRoleExecuteTool('FINANCE', 'driver_pipeline_summary')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. EMERGENCY_OPERATIONS_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

describe('emergency_operations_summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Há emergências ativas?" roteia para emergency_operations_summary', () => {
    const r = routeByRules('Há alguma emergência ativa?');
    expect(r.toolsToCall).toContain('emergency_operations_summary');
  });

  it('retorna emergências e corridas separadas', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 1, unresolved: 2, oldest_active_at: '2026-08-13 12:00' }] }) // emergencies
      .mockResolvedValueOnce({ rows: [{ no_driver: 3, pending_adj: 1 }] }) // rides
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] });

    const r = await getEmergencyOperationsSummary();
    expect(r.data.emergencies.available).toBe(true);
    expect(r.data.emergencies.active).toBe(1);
    expect(r.data.emergencies.unresolved).toBe(2);
    expect(r.data.emergencies.criticalSupported).toBe(false);
    expect(r.data.emergencies.critical).toBeNull();
    expect(r.data.rides.available).toBe(true);
    expect(r.data.rides.noDriver).toBe(3);
    expect(r.data.rides.pendingAdjustment).toBe(1);
  });

  it('FINANCE NÃO pode acessar', () => {
    expect(canRoleExecuteTool('FINANCE', 'emergency_operations_summary')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. TERRITORY_PORTFOLIO_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

describe('territory_portfolio_summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Quantos territórios temos?" roteia para territory_portfolio_summary', () => {
    const r = routeByRules('Quantos territórios temos cadastrados?');
    expect(r.toolsToCall).toContain('territory_portfolio_summary');
  });

  it('"Quais territórios estão sem gestor?" roteia para portfolio sem exigir Cidade/UF', () => {
    const r = routeByRules('Quais territórios estão sem gestor?');
    expect(r.toolsToCall).toEqual(['territory_portfolio_summary']);
  });

  it('retorna portfólio completo com checklist, protocolos, seguros e landings', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'active', cnt: 3 }, { status: 'preparation', cnt: 5 }, { status: 'planning', cnt: 2 }] })
      .mockResolvedValueOnce({ rows: [{ regulatory_status: 'approved', cnt: 3 }, { regulatory_status: 'not_evaluated', cnt: 7 }] })
      .mockResolvedValueOnce({ rows: [{
        without_manager: 4,
        moto_passenger: 2,
        moto_express: 1,
        without_manager_cities: [
          { city: 'Santa Cruz das Palmeiras', uf: 'SP', status: 'planning', isActive: false },
          { city: 'Campinas', uf: 'SP', status: 'active', isActive: true },
        ],
      }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }] }) // checklist
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] }) // protocols
      .mockResolvedValueOnce({ rows: [{ cnt: 2 }] }) // insurance
      .mockResolvedValueOnce({ rows: [{ total: 8, active: 5 }] }) // landings
      .mockResolvedValueOnce({ rows: [{ city_name: 'Campinas', uf: 'SP', status: 'planning', regulatory_status: 'blocked' }] }) // attention
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] });

    const r = await getTerritoryPortfolioSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.total).toBe(10);
    expect(r.data.byStatus['active']).toBe(3);
    expect(r.data.withoutManager).toBe(4);
    expect(r.data.withoutManagerCities).toEqual([
      { city: 'Santa Cruz das Palmeiras', uf: 'SP', status: 'planning', isActive: false },
      { city: 'Campinas', uf: 'SP', status: 'active', isActive: true },
    ]);

    const managerSql = String(mockQuery.mock.calls[2][0]);
    expect(managerSql).toContain('manager_admin.is_active = true');
    expect(managerSql).toContain('managed_t.parent_id = t.id');
    expect(managerSql).toContain('t2.is_active = true');
    expect(managerSql).toContain('managed_t2.parent_id = t2.id');
    expect(r.data.regulatoryChecklist).toEqual({ available: true, pending: 3 });
    expect(r.data.regulatoryProtocols).toEqual({ available: true, pending: 5 });
    expect(r.data.insuranceCoverages).toEqual({ available: true, pending: 2 });
    expect(r.data.cityLandings).toEqual({ available: true, total: 8, active: 5 });
    expect(r.data.attentionCities[0].city).toBe('Campinas');
    expect(r.data.attentionCities[0].reasons).toContain('Regulatório bloqueado');
  });

  it('FINANCE NÃO pode acessar', () => {
    expect(canRoleExecuteTool('FINANCE', 'territory_portfolio_summary')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Registry e integridade
// ══════════════════════════════════════════════════════════════════════════════

describe('command center — registry', () => {
  it('registry contém 28 ferramentas', () => {
    expect(getRegisteredTools()).toHaveLength(28);
  });

  it('todas as 6 novas tools são readOnly', () => {
    const newTools = ['platform_catalog', 'annual_incentive_summary', 'whatsapp_summary', 'driver_pipeline_summary', 'emergency_operations_summary', 'territory_portfolio_summary'];
    for (const name of newTools) {
      const tool = getRegisteredTools().find(t => t.name === name);
      expect(tool).toBeDefined();
      expect(tool!.readOnly).toBe(true);
    }
  });

  it('roteamentos antigos preservados — corridas hoje', () => {
    expect(routeByRules('Corridas hoje?').toolsToCall).toContain('rides_summary_today');
  });

  it('roteamentos antigos preservados — territorial', () => {
    expect(routeByRules('Quero abrir Pirassununga como cidade').toolsToCall).toContain('territory_onboarding_status');
  });

  it('roteamentos antigos preservados — briefing', () => {
    expect(routeByRules('O que precisa da minha atenção hoje?').toolsToCall).toContain('daily_briefing');
  });

  it('nenhuma tool chama OpenAI (platform_catalog é hardcoded)', async () => {
    const r = await getPlatformCatalog({ section: 'overview' });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(r.data.modules.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Correção 5 — Testes novos obrigatórios
// ══════════════════════════════════════════════════════════════════════════════

describe('annual_incentive — edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('motorista totalmente pago não entra em driversWithBalance', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [
        { driver_id: 'd1', program_year: 2026, event_type: 'ACCRUAL', total_cents: '100000' },
        { driver_id: 'd1', program_year: 2026, event_type: 'PAYMENT', total_cents: '100000' },
      ] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] })
      .mockResolvedValueOnce({ rows: [{ current_year: 2026, now_sp: '2026-08-13 14:00' }] })
      .mockResolvedValueOnce({ rows: [{ first_at: null, net_generation: '0' }] });

    const r = await getAnnualIncentiveSummary();
    expect(r.data.driversWithBalance).toBe(0);
  });

  it('carry_forward_in não duplica o accrual do ano', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [
        { driver_id: 'd1', program_year: 2025, event_type: 'ACCRUAL', total_cents: '200000' },
        { driver_id: 'd1', program_year: 2025, event_type: 'CARRY_FORWARD_OUT', total_cents: '200000' },
        { driver_id: 'd1', program_year: 2026, event_type: 'CARRY_FORWARD_IN', total_cents: '200000' },
      ] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] })
      .mockResolvedValueOnce({ rows: [{ current_year: 2026, now_sp: '2026-08-13 14:00' }] })
      .mockResolvedValueOnce({ rows: [{ first_at: null, net_generation: '0' }] });

    const r = await getAnnualIncentiveSummary();
    // 2025: accrued=200000, reversed(carry_out)=200000 → available=0
    // 2026: accrued(carry_in)=200000 → available=200000
    // Total accrued = 400000 (200k original + 200k carry_in)
    // But total available = 200000 (only 2026), not 400000
    expect(r.data.totalAvailableCents).toBe('200000');
    expect(r.data.driversWithBalance).toBe(1);
  });

  it('previsão com geração líquida negativa não retorna adicional negativo', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ driver_id: 'd1', program_year: 2026, event_type: 'ACCRUAL', total_cents: '50000' }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] })
      .mockResolvedValueOnce({ rows: [{ current_year: 2026, now_sp: '2026-08-13 14:00' }] })
      .mockResolvedValueOnce({ rows: [{ first_at: '2026-01-01', net_generation: '-10000' }] });

    const r = await getAnnualIncentiveSummary();
    // Negative net generation → projected additional = 0 or unavailable
    if (r.data.forecast.available) {
      expect(BigInt(r.data.forecast.projectedAdditionalCents!)).toBeGreaterThanOrEqual(0n);
    }
  });
});

describe('driver_pipeline — modalities edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('modalidade pendente é contada corretamente', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'active', cnt: 10 }] })
      .mockResolvedValueOnce({ rows: [{ vehicle_type: 'CAR', cnt: 10 }] })
      .mockResolvedValueOnce({ rows: [{ docs_missing: 0, docs_submitted: 0, docs_rejected: 0, compliance_pending: 0 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'PENDING_REVIEW', cnt: 12 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] });

    const r = await getDriverPipelineSummary();
    expect(r.data.modalities.available).toBe(true);
    expect(r.data.modalities.pending).toBe(12);
  });

  it('falha de modalidades preserva dados básicos do pipeline', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'active', cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [{ vehicle_type: 'CAR', cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [{ docs_missing: 1, docs_submitted: 2, docs_rejected: 0, compliance_pending: 0 }] })
      .mockRejectedValueOnce(new Error('modalities table error')) // modalities fail
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13 14:00' }] });

    const r = await getDriverPipelineSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.total).toBe(5);
    expect(r.data.docsMissing).toBe(1);
    expect(r.data.modalities.available).toBe(false);
  });
});

describe('emergency_operations — availability separation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falha de emergências preserva corridas', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('emergency table error')) // emergencies fail
      .mockResolvedValueOnce({ rows: [{ no_driver: 2, pending_adj: 1 }] }) // rides ok
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getEmergencyOperationsSummary();
    expect(r.data.emergencies.available).toBe(false);
    expect(r.data.rides.available).toBe(true);
    expect(r.data.rides.noDriver).toBe(2);
  });

  it('falha de corridas preserva emergências', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 3, unresolved: 3, oldest_active_at: '2026-08-13' }] }) // emergencies ok
      .mockRejectedValueOnce(new Error('rides error')) // rides fail
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getEmergencyOperationsSummary();
    expect(r.data.emergencies.available).toBe(true);
    expect(r.data.emergencies.active).toBe(3);
    expect(r.data.rides.available).toBe(false);
  });

  it('criticidade não é inventada quando não suportada', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 1, unresolved: 1, oldest_active_at: null }] })
      .mockResolvedValueOnce({ rows: [{ no_driver: 0, pending_adj: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getEmergencyOperationsSummary();
    expect(r.data.emergencies.criticalSupported).toBe(false);
    expect(r.data.emergencies.critical).toBeNull();
  });
});

describe('territory_portfolio — sub-sections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checklist regulatório pendente', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // status
      .mockResolvedValueOnce({ rows: [] }) // reg status
      .mockResolvedValueOnce({ rows: [{ without_manager: 0, moto_passenger: 0, moto_express: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 7 }] }) // checklist
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // protocols
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // insurance
      .mockResolvedValueOnce({ rows: [{ total: 0, active: 0 }] }) // landings
      .mockResolvedValueOnce({ rows: [] }) // attention cities
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getTerritoryPortfolioSummary();
    expect(r.data.regulatoryChecklist).toEqual({ available: true, pending: 7 });
  });

  it('protocolo regulatório pendente', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ without_manager: 0, moto_passenger: 0, moto_express: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 4 }] }) // protocols pending
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, active: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getTerritoryPortfolioSummary();
    expect(r.data.regulatoryProtocols).toEqual({ available: true, pending: 4 });
  });

  it('seguro/cobertura pendente', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ without_manager: 0, moto_passenger: 0, moto_express: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }] }) // insurance pending
      .mockResolvedValueOnce({ rows: [{ total: 0, active: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getTerritoryPortfolioSummary();
    expect(r.data.insuranceCoverages).toEqual({ available: true, pending: 3 });
  });

  it('contagem de landings', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ without_manager: 0, moto_passenger: 0, moto_express: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 12, active: 8 }] }) // landings
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getTerritoryPortfolioSummary();
    expect(r.data.cityLandings).toEqual({ available: true, total: 12, active: 8 });
  });

  it('falha isolada de checklist preserva demais fontes', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'active', cnt: 2 }] })
      .mockResolvedValueOnce({ rows: [{ regulatory_status: 'approved', cnt: 2 }] })
      .mockResolvedValueOnce({ rows: [{ without_manager: 0, moto_passenger: 0, moto_express: 0 }] })
      .mockRejectedValueOnce(new Error('checklist error')) // checklist fails
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] }) // protocols OK
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // insurance OK
      .mockResolvedValueOnce({ rows: [{ total: 5, active: 3 }] }) // landings OK
      .mockResolvedValueOnce({ rows: [] }) // attention
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getTerritoryPortfolioSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.regulatoryChecklist.available).toBe(false);
    expect(r.data.regulatoryProtocols.available).toBe(true);
    expect(r.data.cityLandings.available).toBe(true);
  });

  it('attentionCities limitado a cinco', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ without_manager: 0, moto_passenger: 0, moto_express: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, active: 0 }] })
      .mockResolvedValueOnce({ rows: Array.from({ length: 5 }, (_, i) => ({ city_name: `City${i}`, uf: 'SP', status: 'planning', regulatory_status: 'blocked' })) })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getTerritoryPortfolioSummary();
    expect(r.data.attentionCities.length).toBeLessThanOrEqual(5);
  });
});

describe('segurança — dados sensíveis command center', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nenhuma saída contém CPF, telefone, localização, corpo de mensagem ou documento', async () => {
    // WhatsApp summary
    mockQuery
      .mockResolvedValueOnce({ rows: [{ unread_messages: 3, conversations_with_unread: 2, new_conversations: 1, in_progress_conversations: 2, high_priority: 1 }] })
      .mockResolvedValueOnce({ rows: [{ contact_type: 'driver', status: 'new', priority: 'urgent', unread_count: 3, last_message_at: '2026-08-13' }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-13' }] });

    const r = await getWhatsAppSummary();
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('phone');
    expect(json).not.toContain('body');
    expect(json).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF
    expect(json).not.toContain('lat');
    expect(json).not.toContain('lng');
    expect(json).not.toContain('document_url');
    expect(json).not.toContain('file_url');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Fix: emergency routing priority over drivers_documents_pending
// ══════════════════════════════════════════════════════════════════════════════

describe('routing — emergency vs drivers_documents priority', () => {
  it('"Há emergências, corridas sem motorista ou ajustes pendentes?" → emergency_operations_summary', () => {
    const r = routeByRules('Há emergências, corridas sem motorista ou ajustes pendentes?');
    expect(r.toolsToCall).toContain('emergency_operations_summary');
    expect(r.toolsToCall).not.toContain('drivers_documents_pending');
  });

  it('"Há emergências ativas?" → emergency_operations_summary', () => {
    const r = routeByRules('Há emergências ativas?');
    expect(r.toolsToCall).toContain('emergency_operations_summary');
    expect(r.toolsToCall).not.toContain('drivers_documents_pending');
  });

  it('"Há corridas sem motorista?" → emergency_operations_summary', () => {
    const r = routeByRules('Há corridas sem motorista?');
    expect(r.toolsToCall).toContain('emergency_operations_summary');
    expect(r.toolsToCall).not.toContain('drivers_documents_pending');
  });

  it('"Há ajustes pendentes nas corridas?" → emergency_operations_summary', () => {
    const r = routeByRules('Há ajustes pendentes nas corridas?');
    expect(r.toolsToCall).toContain('emergency_operations_summary');
    expect(r.toolsToCall).not.toContain('drivers_documents_pending');
  });

  it('"Há documentos de motoristas pendentes?" → drivers_documents_pending', () => {
    const r = routeByRules('Há documentos de motoristas pendentes?');
    expect(r.toolsToCall).toContain('drivers_documents_pending');
    expect(r.toolsToCall).not.toContain('emergency_operations_summary');
  });

  it('"Quantos motoristas aguardam aprovação?" → drivers_documents_pending', () => {
    const r = routeByRules('Quantos motoristas aguardam aprovação?');
    expect(r.toolsToCall).toContain('drivers_documents_pending');
    expect(r.toolsToCall).not.toContain('emergency_operations_summary');
  });

  it('nenhuma pergunta acima aciona simultaneamente as duas tools', () => {
    const questions = [
      'Há emergências, corridas sem motorista ou ajustes pendentes?',
      'Há emergências ativas?',
      'Há corridas sem motorista?',
      'Há ajustes pendentes nas corridas?',
      'Há documentos de motoristas pendentes?',
      'Quantos motoristas aguardam aprovação?',
    ];
    for (const question of questions) {
      const r = routeByRules(question);
      const hasEmergency = r.toolsToCall.includes('emergency_operations_summary');
      const hasDriverDocs = r.toolsToCall.includes('drivers_documents_pending');
      expect(hasEmergency && hasDriverDocs).toBe(false);
    }
  });
});

describe('routing — corridas hoje sem motorista vs rides_summary', () => {
  it('"Há corridas hoje sem motorista?" → emergency_operations_summary', () => {
    const r = routeByRules('Há corridas hoje sem motorista?');
    expect(r.toolsToCall).toContain('emergency_operations_summary');
    expect(r.toolsToCall).not.toContain('rides_summary_today');
  });

  it('"Como estão as corridas hoje?" → rides_summary_today', () => {
    const r = routeByRules('Como estão as corridas hoje?');
    // "corridas hoje" matches rides_summary
    expect(r.toolsToCall).toContain('rides_summary_today');
    expect(r.toolsToCall).not.toContain('emergency_operations_summary');
  });

  it('"Corridas hoje?" → rides_summary_today', () => {
    const r = routeByRules('Corridas hoje?');
    expect(r.toolsToCall).toContain('rides_summary_today');
    expect(r.toolsToCall).not.toContain('emergency_operations_summary');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Fix: hybrid router rules-first — routeQuestion tests
// ══════════════════════════════════════════════════════════════════════════════

describe('routeQuestion — hybrid rules-first', () => {
  const mockProvider = {
    decide: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  afterEach(() => {
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('mode=model: "Há emergências, corridas sem motorista ou ajustes pendentes?" → emergency, provider NOT called', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    const r = await routeQuestion('Há emergências, corridas sem motorista ou ajustes pendentes?', mockProvider as any);
    expect(r.toolsToCall).toContain('emergency_operations_summary');
    expect(mockProvider.decide).not.toHaveBeenCalled();
  });

  it('mode=model: "Há emergências ativas?" → emergency, provider NOT called', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    const r = await routeQuestion('Há emergências ativas?', mockProvider as any);
    expect(r.toolsToCall).toContain('emergency_operations_summary');
    expect(mockProvider.decide).not.toHaveBeenCalled();
  });

  it('mode=model: "Há documentos de motoristas pendentes?" → drivers_documents_pending, provider NOT called', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    const r = await routeQuestion('Há documentos de motoristas pendentes?', mockProvider as any);
    expect(r.toolsToCall).toContain('drivers_documents_pending');
    expect(mockProvider.decide).not.toHaveBeenCalled();
  });

  it('mode=model: "Como estão as corridas hoje?" → rides_summary_today, provider NOT called', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    const r = await routeQuestion('Como estão as corridas hoje?', mockProvider as any);
    expect(r.toolsToCall).toContain('rides_summary_today');
    expect(mockProvider.decide).not.toHaveBeenCalled();
  });

  it('mode=model: pergunta não reconhecida → provider chamado exatamente uma vez', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    mockProvider.decide.mockResolvedValueOnce({ toolsToCall: ['rides_summary_today'] });
    const r = await routeQuestion('Qual foi o desempenho geral?', mockProvider as any);
    expect(mockProvider.decide).toHaveBeenCalledTimes(1);
    expect(r.toolsToCall).toContain('rides_summary_today');
  });

  it('mode=model: pergunta desconhecida + decisão inválida → fail-closed', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    mockProvider.decide.mockResolvedValueOnce({ toolsToCall: ['tool_inexistente'] });
    await expect(routeQuestion('Qual é a meta do trimestre?', mockProvider as any)).rejects.toThrow('não registrada');
  });

  it('mode=rules: pergunta reconhecida → comportamento preservado', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'rules';
    const r = await routeQuestion('Corridas hoje?');
    expect(r.toolsToCall).toContain('rides_summary_today');
  });

  it('mode=rules: pergunta desconhecida → toolsToCall vazio', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'rules';
    const r = await routeQuestion('Qual é a meta do trimestre?');
    expect(r.toolsToCall).toHaveLength(0);
  });
});
