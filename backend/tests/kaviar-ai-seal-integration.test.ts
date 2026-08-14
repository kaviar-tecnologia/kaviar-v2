import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

import { getExcellenceSealSummary } from '../src/services/ai/kaviar-ai.compliance-seal';

describe('driver seal endpoint — self-serve', () => {
  it('route exists at /me/excellence-seal with authenticateDriver', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/routes/drivers-v2.ts'), 'utf8');
    expect(src).toContain("'/me/excellence-seal'");
    expect(src).toContain('authenticateDriver');
  });

  it('does NOT accept driverId from URL or body — uses token only', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/routes/drivers-v2.ts'), 'utf8');
    // The route is /me/excellence-seal (no :id param)
    const sealSection = src.split("'/me/excellence-seal'")[1]?.split('export default')[0] || '';
    expect(sealSection).toContain('(req as any).driverId');
    expect(sealSection).not.toContain('req.params.id');
    expect(sealSection).not.toContain('req.body.driverId');
  });

  it('app calls /api/v2/drivers/me/excellence-seal (not admin endpoint)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/components/ExcellenceSealBadge.tsx'), 'utf8');
    expect(src).toContain('/api/v2/drivers/me/excellence-seal');
    expect(src).not.toContain('/api/admin/');
  });
});

describe('excellence seal summary — Chat error handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('empty tables return available:true with zero counts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active: 0, suspended_count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ granted_week: 0, suspended_week: 0 }] })
      .mockResolvedValueOnce({ rows: [{ ref: '2026-08-14 15:00' }] });

    const r = await getExcellenceSealSummary();
    expect(r.data.available).toBe(true);
    expect(r.data.activeCount).toBe(0);
    expect(r.data.suspendedCount).toBe(0);
  });

  it('database error returns available:false and logs the error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(new Error('relation "driver_badges" does not exist'));

    const r = await getExcellenceSealSummary();
    expect(r.data.available).toBe(false);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logMsg = consoleSpy.mock.calls[0][0];
    expect(logMsg).toContain('[EXCELLENCE_SEAL_SUMMARY_ERROR]');
    expect(logMsg).toContain('does not exist');
    // Does not contain secrets or personal data
    expect(logMsg).not.toContain('OPENAI');
    expect(logMsg).not.toContain('password');
    consoleSpy.mockRestore();
  });
});
