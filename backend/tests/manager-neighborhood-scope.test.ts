import { describe, expect, it } from 'vitest';
import {
  isScopeReduction, neighborhoodInManagerFinancialScope,
  requiresMutualAgreementForEarlyReduction, sameNeighborhoodSet,
} from '../src/services/manager-neighborhood-scope';

describe('manager neighborhood financial scope', () => {
  it('preserves full-territory behavior for existing assignments without versions', () => {
    expect(neighborhoodInManagerFinancialScope(null, null, 'bairro-a')).toBe(true);
  });

  it('pays the manager only for origins in the explicit version', () => {
    expect(neighborhoodInManagerFinancialScope('version-1', ['bairro-a', 'bairro-c'], 'bairro-a')).toBe(true);
    expect(neighborhoodInManagerFinancialScope('version-1', ['bairro-a', 'bairro-c'], 'bairro-b')).toBe(false);
    expect(neighborhoodInManagerFinancialScope('version-1', [], 'bairro-a')).toBe(false);
    expect(neighborhoodInManagerFinancialScope('version-1', ['bairro-a'], null)).toBe(false);
  });

  it('compares selections regardless of order', () => {
    expect(sameNeighborhoodSet(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
    expect(sameNeighborhoodSet(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(sameNeighborhoodSet(['a', 'a'], ['a', 'b'])).toBe(false);
  });

  it('recognizes a reduction even when added neighborhoods offset the count', () => {
    expect(isScopeReduction(['a', 'b', 'c'], ['a', 'b'])).toBe(true);
    expect(isScopeReduction(['a', 'b'], ['a', 'c'])).toBe(true);
    expect(isScopeReduction(['a'], ['a', 'b'])).toBe(false);
    expect(isScopeReduction(['a'], [])).toBe(true);
  });

  it('requires an express agreement for a reduction with less than 30 days of notice', () => {
    const now = new Date('2026-10-28T14:00:00Z');
    const early = new Date('2026-11-01T14:00:00Z');
    const adequateNotice = new Date('2026-11-27T14:00:00Z');
    expect(requiresMutualAgreementForEarlyReduction(['a', 'b'], ['a'], early, now)).toBe(true);
    expect(requiresMutualAgreementForEarlyReduction(['a', 'b'], ['a'], adequateNotice, now)).toBe(false);
    expect(requiresMutualAgreementForEarlyReduction(['a'], ['a', 'b'], early, now)).toBe(false);
  });
});
