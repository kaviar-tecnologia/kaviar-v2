/**
 * A version only limits the manager's FINANCIAL participation. The official
 * neighborhoods, geofences and municipality's territorial ownership are never
 * changed by this feature. Absence of a version preserves legacy coverage.
 */
export function neighborhoodInManagerFinancialScope(
  scopeVersionId: string | null | undefined,
  selectedNeighborhoodIds: string[] | null | undefined,
  originNeighborhoodId: string | null | undefined,
): boolean {
  if (!scopeVersionId) return true;
  return Boolean(originNeighborhoodId && selectedNeighborhoodIds?.includes(originNeighborhoodId));
}

export function sameNeighborhoodSet(a: string[], b: string[]): boolean {
  return a.length === b.length && new Set(a).size === new Set(b).size &&
    a.every((id) => b.includes(id));
}

export function isScopeReduction(before: string[], after: string[]): boolean {
  const next = new Set(after);
  return before.some((id) => !next.has(id));
}

export function requiresMutualAgreementForEarlyReduction(
  before: string[], after: string[], effectiveFrom: Date, now: Date,
): boolean {
  const noticePeriodMs = 30 * 24 * 60 * 60 * 1000;
  return isScopeReduction(before, after) &&
    effectiveFrom.getTime() - now.getTime() < noticePeriodMs;
}
