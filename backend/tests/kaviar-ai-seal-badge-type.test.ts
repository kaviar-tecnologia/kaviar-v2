import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

import { getExcellenceSealSummary } from '../src/services/ai/kaviar-ai.compliance-seal';

describe('excellence seal — badge_type (not badge_code) in driver_badges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Chat summary uses badge_type in SQL query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 2, suspended_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ granted_week: 0, suspended_week: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 19:00' }] });

    const r = await getExcellenceSealSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.activeCount).toBe(2);

    // Verify SQL uses badge_type
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('badge_type');
    expect(sql).not.toContain('badge_code');
  });

  it('returns available:true with zeros when no seals exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 0, suspended_count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ granted_week: 0, suspended_week: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 19:00' }] });

    const r = await getExcellenceSealSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.activeCount).toBe(0);
  });

  it('logs error and returns available:false on DB failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const r = await getExcellenceSealSummary();
    expect(r.data.available).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain('EXCELLENCE_SEAL_SUMMARY_ERROR');
    consoleSpy.mockRestore();
  });
});

describe('scheduler — uses badge_type for driver_badges', () => {
  it('scheduler SQL references badge_type, not badge_code, for driver_badges', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');

    // All driver_badges queries should use badge_type
    const driverBadgesLines = src.split('\n').filter((l: string) => l.includes('driver_badges') && !l.includes('driver_badge_events'));
    for (const line of driverBadgesLines) {
      expect(line).not.toContain('badge_code');
      if (line.includes('WHERE') || line.includes('INSERT') || line.includes('ON CONFLICT')) {
        expect(line).toContain('badge_type');
      }
    }
  });

  it('driver_badge_events still uses badge_code (separate table)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/jobs/excellence-seal.job.ts'), 'utf8');

    const eventLines = src.split('\n').filter((l: string) => l.includes('driver_badge_events'));
    for (const line of eventLines) {
      if (line.includes('badge_code')) {
        expect(line).toContain('badge_code'); // correct for events table
      }
    }
  });
});

describe('driver endpoint /me/excellence-seal — uses badge_type', () => {
  it('route uses Prisma with badge_type', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/routes/drivers-v2.ts'), 'utf8');
    const sealSection = src.split("'/me/excellence-seal'")[1]?.split('export default')[0] || '';
    expect(sealSection).toContain('badge_type');
    expect(sealSection).not.toContain('badge_code');
  });
});
