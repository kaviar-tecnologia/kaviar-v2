import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

vi.mock('../src/services/ai/kaviar-ai.command-center', () => ({
  getPlatformCatalog: vi.fn().mockResolvedValue({ tool: 'platform_catalog', data: { section: 'overview', modules: [], note: '' } }),
  getAnnualIncentiveSummary: vi.fn().mockResolvedValue({ tool: 'annual_incentive_summary', data: { available: true, totalOutstandingCents: '0', deadlineBreaches: 0, totalAccruedCents: '0', totalAvailableCents: '0', totalReservedCents: '0', totalPaidCents: '0', totalReversedCents: '0', driversWithBalance: 0, byYear: [], forecast: { available: false }, referenceTime: '' } }),
  getWhatsAppSummary: vi.fn().mockResolvedValue({ tool: 'whatsapp_summary', data: { available: true, unreadMessages: 0, conversationsWithUnread: 0, newConversations: 0, inProgressConversations: 0, highPriorityConversations: 0, referenceTime: '', recentConversations: [] } }),
  getDriverPipelineSummary: vi.fn().mockResolvedValue({ tool: 'driver_pipeline_summary', data: { available: true, total: 0, byStatus: {}, byVehicleType: {}, pendingApproval: 0, docsMissing: 0, docsSubmitted: 0, docsRejected: 0, compliancePending: 0, activeDrivers: 0, suspendedDrivers: 0, modalities: { available: true, pending: 0, approved: 0, rejected: 0 }, referenceTime: '' } }),
  getEmergencyOperationsSummary: vi.fn().mockResolvedValue({ tool: 'emergency_operations_summary', data: { emergencies: { available: true, active: 0, unresolved: 0, critical: null, criticalSupported: false, oldestActiveAt: null }, rides: { available: true, noDriver: 0, pendingAdjustment: 0 }, referenceTime: '' } }),
  getTerritoryPortfolioSummary: vi.fn().mockResolvedValue({ tool: 'territory_portfolio_summary', data: { available: true, total: 0, byStatus: {}, byRegulatoryStatus: {}, withoutManager: 0, withMotoPassenger: 0, withMotoExpress: 0, regulatoryChecklist: { available: true, pending: 0 }, regulatoryProtocols: { available: true, pending: 0 }, insuranceCoverages: { available: true, pending: 0 }, cityLandings: { available: true, total: 0, active: 0 }, attentionCities: [], referenceTime: '' } }),
}));

import { getDriverRatingsSummary } from '../src/services/ai/kaviar-ai.driver-ratings';
import { getRegisteredTools, canRoleExecuteTool } from '../src/services/ai/kaviar-ai.registry';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

describe('driver_ratings_summary — registry and RBAC', () => {
  it('registry contains 19 tools', () => {
    expect(getRegisteredTools()).toHaveLength(19);
  });

  it('driver_ratings_summary is registered and readOnly', () => {
    const tool = getRegisteredTools().find(t => t.name === 'driver_ratings_summary');
    expect(tool).toBeDefined();
    expect(tool!.readOnly).toBe(true);
  });

  it('only SUPER_ADMIN can access', () => {
    expect(canRoleExecuteTool('SUPER_ADMIN', 'driver_ratings_summary')).toBe(true);
    expect(canRoleExecuteTool('FINANCE', 'driver_ratings_summary')).toBe(false);
  });
});

describe('driver_ratings_summary — routing', () => {
  it('"Quais motoristas têm avaliações baixas?" → driver_ratings_summary', () => {
    const r = routeByRules('Quais motoristas têm avaliações baixas?');
    expect(r.toolsToCall).toContain('driver_ratings_summary');
  });

  it('"Qual a média do motorista?" → driver_ratings_summary', () => {
    const r = routeByRules('Qual a média do motorista?');
    expect(r.toolsToCall).toContain('driver_ratings_summary');
  });

  it('"Há motoristas com notas baixas recorrentes?" → driver_ratings_summary', () => {
    const r = routeByRules('Há motoristas com notas baixas recorrentes?');
    expect(r.toolsToCall).toContain('driver_ratings_summary');
  });

  it('does NOT route financial questions to ratings', () => {
    const r = routeByRules('Quais obrigações financeiras estão pendentes?');
    expect(r.toolsToCall).not.toContain('driver_ratings_summary');
  });
});

describe('driver_ratings_summary — attention criteria', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns drivers with 3+ low ratings in 30 days', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 50, avg_rating: '4.32' }] })
      .mockResolvedValueOnce({ rows: [
        { driver_id: 'd1', driver_name: 'João', low_count: 4, avg_rating: '2.50', total_ratings: 20 },
        { driver_id: 'd2', driver_name: 'Maria', low_count: 3, avg_rating: '3.10', total_ratings: 15 },
      ] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });

    const r = await getDriverRatingsSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.driversNeedingAttention).toHaveLength(2);
    expect(r.data.driversNeedingAttention[0].lowRatingsCount).toBe(4);
    expect(r.data.attentionCriteria).toContain('3+');
    expect(r.data.attentionCriteria).toContain('30 dias');
  });

  it('returns empty attention list when no drivers meet criteria', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 10, avg_rating: '4.80' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });

    const r = await getDriverRatingsSummary();
    expect(r.data.driversNeedingAttention).toHaveLength(0);
  });

  it('attention uses rating <= 2 (1 or 2 stars), not average < 3.5', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 5, avg_rating: '4.00' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });

    await getDriverRatingsSummary();
    // Check the SQL uses rating <= 2 (param $1)
    const attentionSql: string = mockQuery.mock.calls[1][0];
    const attentionParams = mockQuery.mock.calls[1][1];
    expect(attentionSql).toContain('r.rating <= $1');
    expect(attentionParams[0]).toBe(2); // threshold: 1 or 2 stars
    expect(attentionParams[2]).toBe(3); // minimum count
  });
});

describe('driver_ratings_summary — individual lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns individual driver stats when driverId provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 50, avg_rating: '4.32' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] })
      .mockResolvedValueOnce({ rows: [{
        driver_name: 'Carlos', avg_rating: '3.80', total_ratings: 25,
        r1: 1, r2: 2, r3: 5, r4: 10, r5: 7, low_30d: 2,
      }] });

    const r = await getDriverRatingsSummary({ driverId: 'driver-123' });
    expect(r.data.individual?.available).toBe(true);
    expect(r.data.individual?.driverName).toBe('Carlos');
    expect(r.data.individual?.averageRating).toBe('3.80');
    expect(r.data.individual?.distribution['5']).toBe(7);
    expect(r.data.individual?.needsAttention).toBe(false); // 2 < 3
  });

  it('individual with 3+ low ratings in 30d → needsAttention true', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 50, avg_rating: '4.32' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] })
      .mockResolvedValueOnce({ rows: [{
        driver_name: 'Pedro', avg_rating: '2.50', total_ratings: 10,
        r1: 3, r2: 2, r3: 2, r4: 2, r5: 1, low_30d: 4,
      }] });

    const r = await getDriverRatingsSummary({ driverId: 'driver-456' });
    expect(r.data.individual?.needsAttention).toBe(true);
  });

  it('driver not found returns empty individual', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 50, avg_rating: '4.32' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await getDriverRatingsSummary({ driverId: 'nonexistent' });
    expect(r.data.individual?.available).toBe(true);
    expect(r.data.individual?.totalRatings).toBe(0);
  });
});

describe('driver_ratings_summary — security and privacy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SQL filters only passenger-to-driver ratings', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 0, avg_rating: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });

    await getDriverRatingsSummary();
    const attentionSql: string = mockQuery.mock.calls[1][0];
    expect(attentionSql).toContain("entity_type = 'DRIVER'");
    expect(attentionSql).toContain("rater_type = 'PASSENGER'");
  });

  it('never returns comment or tags fields', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 1, avg_rating: '4.00' }] })
      .mockResolvedValueOnce({ rows: [{ driver_id: 'd1', driver_name: 'Test', low_count: 3, avg_rating: '2.00', total_ratings: 5 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });

    const r = await getDriverRatingsSummary();
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('comment');
    expect(json).not.toContain('tags');
  });

  it('does not call it "reclamação" or "complaint"', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_drivers: 1, avg_rating: '4.00' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });

    const r = await getDriverRatingsSummary();
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('reclamação');
    expect(json).not.toContain('complaint');
    expect(json).not.toContain('denuncia');
  });

  it('FINANCE cannot access', async () => {
    const r = await askKaviarAi({ userId: 'f1', question: 'Quais motoristas têm avaliações baixas?', role: 'FINANCE' });
    expect(r.answer).toContain('permissão');
    expect(r.toolsUsed).toHaveLength(0);
  });

  it('falha de consulta retorna available: false', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection error'));
    const r = await getDriverRatingsSummary();
    expect(r.data.available).toBe(false);
  });
});
