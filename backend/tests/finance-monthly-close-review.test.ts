import { describe, expect, it } from 'vitest';
import { CloseReviewError, INTERNAL_REVIEW_APPROVED } from '../src/services/finance/monthly-close-review.service';

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
});
