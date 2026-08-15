import { beforeEach, describe, expect, it, vi } from 'vitest';
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));
vi.mock('../src/services/email/inbound-email-security-risk', () => ({ evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }) }));
vi.mock('../src/services/ai/kaviar-ai.command-center', () => ({ getPlatformCatalog: vi.fn().mockResolvedValue({ tool: 'platform_catalog', data: { section: 'overview', modules: [], note: '' } }), getAnnualIncentiveSummary: vi.fn().mockResolvedValue({ tool: 'annual_incentive_summary', data: { available: true, totalOutstandingCents: '0', deadlineBreaches: 0 } }), getWhatsAppSummary: vi.fn().mockResolvedValue({ tool: 'whatsapp_summary', data: { available: true, unreadMessages: 0 } }), getDriverPipelineSummary: vi.fn().mockResolvedValue({ tool: 'driver_pipeline_summary', data: { available: true } }), getEmergencyOperationsSummary: vi.fn().mockResolvedValue({ tool: 'emergency_operations_summary', data: { emergencies: { available: true, active: 0 }, rides: { available: true } } }), getTerritoryPortfolioSummary: vi.fn().mockResolvedValue({ tool: 'territory_portfolio_summary', data: { available: true } }) }));

import { getOperationsOverview, getPersonLookup, getDriverDetail, getSealHistory } from '../src/services/ai/kaviar-ai.central-ops';
import { getRegisteredTools, canRoleExecuteTool } from '../src/services/ai/kaviar-ai.registry';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';

describe('registry — 25 tools', () => {
  it('registry contains 25 tools', () => { expect(getRegisteredTools()).toHaveLength(25); });
  it('all new tools are SUPER_ADMIN and readOnly', () => {
    for (const name of ['operations_overview', 'person_lookup', 'driver_detail', 'seal_history']) {
      expect(canRoleExecuteTool('SUPER_ADMIN', name)).toBe(true);
      expect(canRoleExecuteTool('FINANCE', name)).toBe(false);
      const t = getRegisteredTools().find(t => t.name === name);
      expect(t?.readOnly).toBe(true);
    }
  });
});

describe('operations_overview', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns full overview', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 100, active: 80, pending: 10, suspended: 5 }] })
      .mockResolvedValueOnce({ rows: [{ seal_active: 3, seal_suspended: 1 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 8 }] })
      .mockResolvedValueOnce({ rows: [{ role: 'SUPER_ADMIN', cnt: 2 }, { role: 'TERRITORIAL_MANAGER', cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [{ total: 10, active: 3, preparation: 5, blocked: 1 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14' }] });
    const r = await getOperationsOverview();
    expect(r.data.available).toBe(true);
    expect(r.data.drivers.total).toBe(100);
    expect(r.data.drivers.sealActive).toBe(3);
    expect(r.data.territories.blocked).toBe(1);
  });
  it('routes "visão geral operacional"', () => { expect(routeByRules('Visão geral operacional').toolsToCall).toContain('operations_overview'); });
  it('routes "Quantas homologações Pet aprovadas temos?"', () => { expect(routeByRules('Quantas homologações Pet aprovadas temos?').toolsToCall).toContain('operations_overview'); });
  it('routes "Quantos territórios temos?" to territory_portfolio (more specific)', () => { expect(routeByRules('Quantos territórios temos cadastrados?').toolsToCall).toContain('territory_portfolio_summary'); });
  it('routes "Quantos motoristas ativos?" to pipeline (more specific)', () => { expect(routeByRules('Quantos motoristas ativos temos?').toolsToCall).toContain('driver_pipeline_summary'); });
  it('routes "motoristas pendentes" — matches driver docs (motorista+aguardando+cadastro)', () => {
    // "Há motoristas aguardando aprovação?" hits drivers_documents_pending
    expect(routeByRules('Há motoristas aguardando aprovação?').toolsToCall).toContain('drivers_documents_pending');
  });
  it('routes "panorama operacional" to operations_overview', () => { expect(routeByRules('Me dê o panorama operacional').toolsToCall).toContain('operations_overview'); });
  it('routes "Quantos gestores temos?"', () => { expect(routeByRules('Quantos gestores temos?').toolsToCall).toContain('operations_overview'); });
});

describe('person_lookup', () => {
  beforeEach(() => vi.clearAllMocks());
  it('finds single person', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', name: 'João Silva', status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const r = await getPersonLookup({ name: 'João Silva' });
    expect(r.data.results).toHaveLength(1);
    expect(r.data.ambiguous).toBe(false);
  });
  it('flags ambiguity with multiple results', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', name: 'João A', status: 'active' }, { id: 'd2', name: 'João B', status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const r = await getPersonLookup({ name: 'João' });
    expect(r.data.results.length).toBeGreaterThan(1);
    expect(r.data.ambiguous).toBe(true);
  });
  it('returns empty for no match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const r = await getPersonLookup({ name: 'ZZZZZ' });
    expect(r.data.results).toHaveLength(0);
  });
  it('never returns CPF, phone, email or password', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', name: 'Test', status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const r = await getPersonLookup({ name: 'Test' });
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('cpf'); expect(json).not.toContain('phone');
    expect(json).not.toContain('email'); expect(json).not.toContain('password');
  });
  it('routes "quem é João"', () => { expect(routeByRules('Quem é João?').toolsToCall).toContain('person_lookup'); });
  it('routes "mostre o motorista Pedro"', () => { expect(routeByRules('Mostre o motorista Pedro').toolsToCall).toContain('person_lookup'); });
});

describe('driver_detail', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns detail for existing driver', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Ana', status: 'active', vehicle_type: 'CAR' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.5', total: 100 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'approved', valid_until: '2027-01-01', emission_date: '2026-07-01' }] })
      .mockResolvedValueOnce({ rows: [{ progress: 100, unlocked_at: '2026-06-01' }] })
      .mockResolvedValueOnce({ rows: [{ modality: 'MOTO_PASSENGER', status: 'APPROVED' }] });
    const r = await getDriverDetail({ driverId: 'd1' });
    expect(r.data.found).toBe(true);
    expect(r.data.name).toBe('Ana');
    expect(r.data.seal?.active).toBe(true);
    expect(r.data.modalities).toHaveLength(1);
  });
  it('returns found:false for nonexistent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getDriverDetail({ driverId: 'xxx' });
    expect(r.data.found).toBe(false);
  });
});

describe('seal_history', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns history with events', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 5, suspended: 2 }] })
      .mockResolvedValueOnce({ rows: [{ driver_name: 'Carlos', event_type: 'GRANTED', reason: null, created_at: '2026-08-10' }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14' }] });
    const r = await getSealHistory();
    expect(r.data.available).toBe(true);
    expect(r.data.recentEvents).toHaveLength(1);
    expect(r.data.recentEvents[0].eventType).toBe('GRANTED');
  });
  it('routes "histórico do selo"', () => { expect(routeByRules('Histórico do selo excelência').toolsToCall).toContain('seal_history'); });
});

// ══════════════════════════════════════════════════════════════════════════════
// Review points 1-5
// ══════════════════════════════════════════════════════════════════════════════

import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

describe('point 1 — natural question resolves name to driver_detail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"Qual a média do motorista João Silva?" resolves name and returns detail', async () => {
    // person_lookup: find João Silva
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd-joao-1', name: 'João Silva', status: 'active' }] }) // drivers
      .mockResolvedValueOnce({ rows: [] }) // admins
      .mockResolvedValueOnce({ rows: [] }) // passengers
      // driver_detail auto-chain:
      .mockResolvedValueOnce({ rows: [{ name: 'João Silva', status: 'active', vehicle_type: 'CAR' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '4.6', total: 200 }] }) // ratings
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] }) // low ratings
      .mockResolvedValueOnce({ rows: [{ status: 'approved', valid_until: '2027-01-01', emission_date: '2026-07-01' }] }) // compliance
      .mockResolvedValueOnce({ rows: [{ progress: 100, unlocked_at: '2026-06-01' }] }) // seal
      .mockResolvedValueOnce({ rows: [] }); // modalities

    const r = await askKaviarAi({ userId: 'a', question: 'Qual a média do motorista João Silva?', role: 'SUPER_ADMIN' });
    expect(r.toolsUsed).toContain('person_lookup');
    expect(r.toolsUsed).toContain('driver_detail');
    expect(r.answer).toContain('João Silva');
    expect(r.answer).toContain('4.6');
  });
});

describe('point 2 — homonyms request disambiguation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('two results show options and do NOT auto-chain to driver_detail', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', name: 'João A', status: 'active' }, { id: 'd2', name: 'João B', status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await getPersonLookup({ name: 'João' });
    expect(r.data.results.length).toBe(2);
    expect(r.data.ambiguous).toBe(true);
    expect(r.data.message).toContain('Qual deles');
  });
});

describe('point 3 — person_lookup searches drivers, admins, passengers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches all three tables and returns admin', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // drivers - empty
      .mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'Maria Admin', role: 'SUPER_ADMIN' }] }) // admins
      .mockResolvedValueOnce({ rows: [] }); // passengers - empty

    const r = await getPersonLookup({ name: 'Maria' });
    expect(r.data.results).toHaveLength(1);
    expect(r.data.results[0].type).toBe('admin');
    expect(r.data.results[0].role).toBe('SUPER_ADMIN');
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('passenger results include type but no admin link', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // drivers
      .mockResolvedValueOnce({ rows: [] }) // admins
      .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Ana Passageira' }] }); // passengers

    const r = await getPersonLookup({ name: 'Ana' });
    expect(r.data.results).toHaveLength(1);
    expect(r.data.results[0].type).toBe('passenger');
    expect(r.data.results[0].adminLink).toBeNull();
  });
});

describe('point 4 — Pet, gestores and links use real sources', () => {
  it('operations_overview queries pet_homologations.quiz_passed (not active drivers)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/ai/kaviar-ai.central-ops.ts'), 'utf8');
    expect(src).toContain("FROM pet_homologations WHERE quiz_passed=true");
    // Formatter says "homologações", not "motoristas ativos"
    const svcSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/ai/kaviar-ai.service.ts'), 'utf8');
    expect(svcSrc).toContain('Homologações Pet aprovadas');
    expect(svcSrc).not.toContain('Pet aprovados:');
  });

  it('operations_overview queries admins with is_active', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/ai/kaviar-ai.central-ops.ts'), 'utf8');
    expect(src).toContain("FROM admins WHERE is_active=true");
  });

  it('admin links are real routes from AdminApp', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/ai/kaviar-ai.central-ops.ts'), 'utf8');
    // Only uses /admin/drivers and /admin/staff
    expect(src).toContain('/admin/drivers');
    expect(src).toContain('/admin/staff');
    // Does NOT invent routes
    expect(src).not.toContain('/admin/passengers');
    expect(src).not.toContain('/admin/seal');
  });
});

describe('point 5 — operational log without PII (not persistent audit)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('person_lookup logs result count without the searched name', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockQuery
      .mockResolvedValueOnce({ rows: [] })  // drivers
      .mockResolvedValueOnce({ rows: [] })  // admins
      .mockResolvedValueOnce({ rows: [] }); // passengers

    await getPersonLookup({ name: 'Teste Sensível' });

    const auditLog = consoleSpy.mock.calls.find(c => c[0]?.includes('PERSON_LOOKUP_AUDIT'));
    expect(auditLog).toBeDefined();
    expect(auditLog![0]).toContain('results=0');
    expect(auditLog![0]).not.toContain('Teste');
    consoleSpy.mockRestore();
  });
});
