import { describe, expect, it } from 'vitest';
import { CloseReviewError, INTERNAL_REVIEW_APPROVED, stableReviewSnapshotHash } from '../src/services/finance/monthly-close-review.service';

describe('PR407 review contract (not final closing)', () => {
  it('names internal approval distinctly from financial CLOSED', () => {
    expect(INTERNAL_REVIEW_APPROVED).toBe('INTERNAL_REVIEW_APPROVED');
    expect(INTERNAL_REVIEW_APPROVED).not.toBe('CLOSED');
  });
  it('preserves structured HTTP errors', () => {
    const err = new CloseReviewError(409, 'STALE_MONTHLY_REVIEW_SNAPSHOT');
    expect(err.status).toBe(409);
    expect(err.code).toBe('STALE_MONTHLY_REVIEW_SNAPSHOT');
  });
  it('hashes the same grouped evidence independent of DB group and key order', () => {
    const a = { entity: 'synthetic', obligations: [{ status: 'PENDING', count: 1 },
      { status: 'DRAFT', count: 2 }], ledger: { posted: '0', count: 0 } };
    const b = { ledger: { count: 0, posted: '0' },
      obligations: [{ count: 2, status: 'DRAFT' }, { count: 1, status: 'PENDING' }],
      entity: 'synthetic' };
    expect(stableReviewSnapshotHash(a)).toBe(stableReviewSnapshotHash(b));
    expect(stableReviewSnapshotHash(a)).not.toBe(stableReviewSnapshotHash({
      ...a, ledger: { ...a.ledger, posted: '100' },
    }));
  });
});
