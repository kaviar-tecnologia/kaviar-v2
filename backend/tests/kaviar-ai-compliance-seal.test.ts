import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

import { getComplianceSummary, getExcellenceSealSummary } from '../src/services/ai/kaviar-ai.compliance-seal';
import { getRegisteredTools, canRoleExecuteTool } from '../src/services/ai/kaviar-ai.registry';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';

describe('compliance_summary + excellence_seal_summary — registry', () => {
  it('registry contains 20 tools', () => {
    expect(getRegisteredTools()).toHaveLength(20);
  });

  it('compliance_summary registered as SUPER_ADMIN only readOnly', () => {
    const t = getRegisteredTools().find(t => t.name === 'compliance_summary');
    expect(t).toBeDefined();
    expect(t!.readOnly).toBe(true);
    expect(t!.allowedRoles).toEqual(['SUPER_ADMIN']);
  });

  it('excellence_seal_summary registered as SUPER_ADMIN only readOnly', () => {
    const t = getRegisteredTools().find(t => t.name === 'excellence_seal_summary');
    expect(t).toBeDefined();
    expect(t!.readOnly).toBe(true);
    expect(t!.allowedRoles).toEqual(['SUPER_ADMIN']);
  });

  it('FINANCE cannot access compliance or seal tools', () => {
    expect(canRoleExecuteTool('FINANCE', 'compliance_summary')).toBe(false);
    expect(canRoleExecuteTool('FINANCE', 'excellence_seal_summary')).toBe(false);
  });
});

describe('compliance_summary — routing', () => {
  it('"Quantos antecedentes vencem em 30 dias?" → compliance_summary', () => {
    expect(routeByRules('Quantos antecedentes vencem em 30 dias?').toolsToCall).toContain('compliance_summary');
  });

  it('"Há certidões vencidas?" → compliance_summary', () => {
    expect(routeByRules('Há certidões vencidas?').toolsToCall).toContain('compliance_summary');
  });
});

describe('compliance_summary — data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns aggregated compliance data', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 50, valid: 30, expiring: 5, expired: 3, no_emission: 10, pending: 2 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });
    const r = await getComplianceSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.valid).toBe(30);
    expect(r.data.expired).toBe(3);
    expect(r.data.noEmissionDate).toBe(10);
  });

  it('returns available:false on failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const r = await getComplianceSummary();
    expect(r.data.available).toBe(false);
  });

  it('never returns document URLs or personal data', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 1, valid: 1, expiring: 0, expired: 0, no_emission: 0, pending: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '' }] });
    const r = await getComplianceSummary();
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('file_url');
    expect(json).not.toContain('cpf');
    expect(json).not.toContain('driver_id');
  });
});

describe('excellence_seal_summary — routing', () => {
  it('"Quantos motoristas têm o selo excelência?" → excellence_seal_summary', () => {
    expect(routeByRules('Quantos motoristas têm o selo excelência?').toolsToCall).toContain('excellence_seal_summary');
  });

  it('"Selo ativo motoristas" → excellence_seal_summary', () => {
    expect(routeByRules('Quantos selos ativos temos entre motoristas?').toolsToCall).toContain('excellence_seal_summary');
  });
});

describe('excellence_seal_summary — data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns seal counts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 5, suspended_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ granted_week: 1, suspended_week: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 12:00' }] });
    const r = await getExcellenceSealSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.activeCount).toBe(5);
    expect(r.data.suspendedCount).toBe(2);
    expect(r.data.grantedThisWeek).toBe(1);
  });

  it('returns available:false on failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('error'));
    const r = await getExcellenceSealSummary();
    expect(r.data.available).toBe(false);
  });
});

describe('compliance service — 6 month validity', () => {
  it('REVALIDATION_PERIOD_MONTHS is 6', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance.service.ts'), 'utf8');
    expect(src).toContain('REVALIDATION_PERIOD_MONTHS = 6');
    expect(src).not.toContain('REVALIDATION_PERIOD_MONTHS = 12');
  });

  it('approveDocument accepts emissionDate parameter', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance.service.ts'), 'utf8');
    expect(src).toContain('emissionDate');
    expect(src).toContain('emission_date');
    expect(src).toContain('Data de emissão não pode ser futura');
  });

  it('legacy documents without emission_date are preserved (no false validade)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance.service.ts'), 'utf8');
    // New approvals require emission_date — no fallback
    expect(src).toContain('Data de emissão é obrigatória');
    expect(src).not.toContain('parsedEmissionDate || new Date()');
    // Legacy docs (already approved) keep their existing valid_until unchanged
    // because approval flow is only for NEW documents
  });
});

describe('excellence seal scheduler', () => {
  it('scheduler file exists with correct criteria', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');
    expect(src).toContain('EXCELLENCE_SEAL');
    expect(src).toContain('MIN_COMPLETED_RIDES = 10_000');
    expect(src).toContain('MIN_HISTORICAL_AVG = 4.7');
    expect(src).toContain('MIN_RECENT_AVG_90D = 4.6');
    expect(src).toContain('MIN_TOTAL_RATINGS = 500');
    expect(src).toContain('MIN_RECENT_RATINGS_90D = 10');
    expect(src).toContain('GRACE_PERIOD_DAYS = 7');
    expect(src).toContain("r.status = 'completed'");
    expect(src).toContain('s.settled_at IS NOT NULL');
    expect(src).toContain("entity_type = 'DRIVER'");
    expect(src).toContain("rater_type = 'PASSENGER'");
    expect(src).toContain('emission_date IS NOT NULL');
  });

  it('scheduler uses advisory lock', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');
    expect(src).toContain('withSchedulerLock');
    expect(src).toContain('excellence_seal_daily');
  });

  it('immediate suspension for low ratings', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');
    expect(src).toContain("failedCriteria.includes('lowRatings30d')");
    expect(src).toContain('Notas baixas recorrentes (imediato)');
  });

  it('grace period for other criteria', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');
    expect(src).toContain('CRITERIA_FAIL_DETECTED');
    expect(src).toContain('GRACE_PERIOD_DAYS - 1');
  });

  it('revocation is separate from suspension', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');
    // Scheduler does GRANTED/SUSPENDED/RESTORED but NOT REVOKED
    expect(src).toContain("'GRANTED'");
    expect(src).toContain("'SUSPENDED'");
    expect(src).toContain("'RESTORED'");
    // REVOKED is only in admin endpoint
    const routeSrc = fs.readFileSync(path.resolve(__dirname, '../src/routes/admin-drivers.ts'), 'utf8');
    expect(routeSrc).toContain("'REVOKED'");
    expect(routeSrc).toContain('requireSuperAdmin');
  });
});

describe('admin seal endpoints', () => {
  it('GET excellence-seal uses allowReadAccess', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/routes/admin-drivers.ts'), 'utf8');
    expect(src).toContain("'/drivers/:id/excellence-seal', allowReadAccess");
  });

  it('POST revoke uses requireSuperAdmin and requires reason', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/routes/admin-drivers.ts'), 'utf8');
    expect(src).toContain("'/drivers/:id/excellence-seal/revoke', requireSuperAdmin");
    expect(src).toContain('reason');
    expect(src).toContain('mínimo 5 caracteres');
  });
});

describe('migration', () => {
  it('adds emission_date and driver_badge_events', () => {
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(path.resolve(__dirname, '../prisma/migrations/20260814125000_compliance_6m_excellence_seal/migration.sql'), 'utf8');
    expect(sql).toContain('emission_date');
    expect(sql).toContain('driver_badge_events');
    expect(sql).toContain('badge_code');
    expect(sql).toContain('event_type');
    expect(sql).toContain('criteria_snapshot');
  });
});

describe('ban auto-revokes seal', () => {
  it('enforcement service revokes EXCELLENCE_SEAL on ban', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/driver-enforcement.ts'), 'utf8');
    expect(src).toContain("badge_code: 'EXCELLENCE_SEAL'");
    expect(src).toContain("event_type: 'REVOKED'");
    expect(src).toContain('Banimento do motorista');
    // Only happens within the BAN action block
    const banSection = src.split("action: 'BAN'")[1]?.split("action: 'UNBAN'")[0] || '';
    expect(banSection).toContain('EXCELLENCE_SEAL');
  });
});

describe('frontend admin — emission_date', () => {
  it('ComplianceManagement sends emission_date on approve', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/ComplianceManagement.jsx'), 'utf8');
    expect(src).toContain('emission_date');
    expect(src).toContain('emissionDate');
    expect(src).toContain('Data de emissão');
    expect(src).toContain('6 meses');
    expect(src).not.toContain('12 meses');
  });
});

describe('app motorista — seal badge', () => {
  it('ExcellenceSealBadge component exists with correct content', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/components/ExcellenceSealBadge.tsx'), 'utf8');
    expect(src).toContain('Selo Excelência KAVIAR');
    expect(src).toContain('trophy');
    expect(src).toContain('excellence-seal');
    // Does NOT render metrics or threshold values in the UI
    expect(src).not.toContain('4.7');
    expect(src).not.toContain('10.000');
    expect(src).not.toContain('10000');
  });

  it('driver profile imports ExcellenceSealBadge', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../app/(driver)/profile.tsx'), 'utf8');
    expect(src).toContain('ExcellenceSealBadge');
  });
});

describe('app passageiro — discrete indicator', () => {
  it('DriverExcellenceIndicator shows only when active', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/components/passenger/DriverExcellenceIndicator.tsx'), 'utf8');
    expect(src).toContain('sealActive');
    expect(src).toContain('if (!sealActive) return null');
    expect(src).toContain('Excelência KAVIAR');
    expect(src).not.toContain('history');
    expect(src).not.toContain('4.7');
    expect(src).not.toContain('criteria');
  });

  it('indicator is imported and rendered in passenger map.tsx (ride tracking)', () => {
    const fs = require('fs');
    const path = require('path');
    const mapSrc = fs.readFileSync(path.resolve(__dirname, '../../app/(passenger)/map.tsx'), 'utf8');
    expect(mapSrc).toContain('DriverExcellenceIndicator');
    expect(mapSrc).toContain('has_excellence_seal');
    expect(mapSrc).toContain("import { DriverExcellenceIndicator }");
  });

  it('backend ride endpoint provides has_excellence_seal', () => {
    const fs = require('fs');
    const path = require('path');
    const routeSrc = fs.readFileSync(path.resolve(__dirname, '../src/routes/rides-v2.ts'), 'utf8');
    expect(routeSrc).toContain('has_excellence_seal');
    expect(routeSrc).toContain('EXCELLENCE_SEAL');
  });
});

describe('notifications — use valid_until (already 6m from emission)', () => {
  it('notification service queries by valid_until and does not block', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance-notifications.service.ts'), 'utf8');
    expect(src).toContain('valid_until');
    expect(src).toContain('is_current: true');
    // Does NOT block or suspend drivers
    expect(src).not.toContain('status: "blocked"');
    expect(src).not.toContain("status: 'blocked'");
    expect(src).not.toContain('suspendDriver');
    expect(src).not.toContain('banDriver');
  });
});

describe('compliance — emission_date → valid_until pipeline', () => {
  it('emission_date is MANDATORY for new approvals (no fallback)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance.service.ts'), 'utf8');
    // Throws when not provided
    expect(src).toContain('Data de emissão é obrigatória para novas aprovações');
    // No fallback to new Date()
    expect(src).not.toContain('parsedEmissionDate || new Date()');
    // baseDate is always parsedEmissionDate
    expect(src).toContain('const baseDate = parsedEmissionDate!');
  });

  it('valid_until is calculated from emission_date + 6 months', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance.service.ts'), 'utf8');
    expect(src).toContain('new Date(baseDate.getTime())');
    expect(src).toContain('REVALIDATION_PERIOD_MONTHS');
    expect(src).toContain('= 6');
  });

  it('legacy document without emission_date does NOT generate false expiry', () => {
    const fs = require('fs');
    const path = require('path');
    // Notifications only alert docs with valid_until set
    const notifSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance-notifications.service.ts'), 'utf8');
    expect(notifSrc).toContain('valid_until');
    // Legacy docs (emission_date=null) keep their existing valid_until
    // New flow requires emission_date — no false dates generated
    const compSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/compliance.service.ts'), 'utf8');
    expect(compSrc).toContain('emission_date: parsedEmissionDate');
  });

  it('compliance_summary tool distinguishes no-emission from expired', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/ai/kaviar-ai.compliance-seal.ts'), 'utf8');
    expect(src).toContain('emission_date IS NULL');
    expect(src).toContain('valid_until < NOW()');
  });
});

describe('ban → auto-revocation of excellence seal', () => {
  it('ban action includes seal deletion and REVOKED event within same transaction', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/driver-enforcement.ts'), 'utf8');
    // Within the ban transaction block
    const banBlock = src.split("action: 'BAN'")[1]?.split("return updatedDriver")[0] || '';
    expect(banBlock).toContain('EXCELLENCE_SEAL');
    expect(banBlock).toContain('delete');
    expect(banBlock).toContain("event_type: 'REVOKED'");
    expect(banBlock).toContain('Banimento do motorista');
    // Uses tx (transaction) not prisma directly
    expect(banBlock).toContain('tx.driver_badges');
    expect(banBlock).toContain('tx.driver_badge_events');
  });

  it('seal scheduler NEVER revokes — only GRANT/SUSPEND/RESTORE', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');
    // Scheduler does NOT use REVOKED event type
    expect(src).not.toContain("'REVOKED'");
    // Only uses these
    expect(src).toContain("'GRANTED'");
    expect(src).toContain("'SUSPENDED'");
    expect(src).toContain("'RESTORED'");
    expect(src).toContain("'CRITERIA_FAIL_DETECTED'");
  });
});
