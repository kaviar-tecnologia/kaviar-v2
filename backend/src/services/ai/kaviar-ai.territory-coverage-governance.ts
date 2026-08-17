export const COVERAGE_STATUSES = [
  'NOT_LOADED',
  'AWAITING_REVIEW',
  'COMPLETE',
] as const;

export type CoverageStatus =
  typeof COVERAGE_STATUSES[number];

export type CoverageTransitionPlan = {
  confirmation: string;
  auditAction: string;
  requiresReason: boolean;
};

export function isCoverageStatus(
  value: unknown
): value is CoverageStatus {
  return (
    typeof value === 'string' &&
    (COVERAGE_STATUSES as readonly string[]).includes(value)
  );
}

export function resolveCoverageTransition(
  currentStatus: CoverageStatus,
  targetStatus: CoverageStatus
): CoverageTransitionPlan | null {
  if (
    currentStatus === 'NOT_LOADED' &&
    targetStatus === 'AWAITING_REVIEW'
  ) {
    return {
      confirmation: 'ENVIAR_COBERTURA_REVISAO',
      auditAction: 'territory_coverage_submit_review',
      requiresReason: false,
    };
  }

  if (
    currentStatus === 'AWAITING_REVIEW' &&
    targetStatus === 'COMPLETE'
  ) {
    return {
      confirmation: 'HOMOLOGAR_COBERTURA',
      auditAction: 'territory_coverage_homologate',
      requiresReason: false,
    };
  }

  if (
    currentStatus === 'COMPLETE' &&
    targetStatus === 'AWAITING_REVIEW'
  ) {
    return {
      confirmation: 'REABRIR_COBERTURA',
      auditAction: 'territory_coverage_reopen',
      requiresReason: true,
    };
  }

  return null;
}

export function resolveCoverageNotes(
  currentNotes: string | null | undefined,
  normalizedNotes: string
): string | null {
  return normalizedNotes || currentNotes || null;
}
