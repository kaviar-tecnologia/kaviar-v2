import { TERRITORIAL_MANAGER_CONTRACT_VERSION } from './territorial-manager-contract-v1_2';

export type TerritorialManagerContractUiKey =
  | 'formalized'
  | 'in_review'
  | 'available'
  | 'legacy_inconsistent'
  | 'pending';

export interface TerritorialManagerProfileLike {
  relationship_type: string;
  contract_status: string;
  terms_version?: string | null;
  contract_url?: string | null;
}

export interface TerritorialManagerAssignmentLike {
  id: string;
  status: string;
  started_at: Date;
  ended_at?: Date | null;
}

export function deriveTerritorialManagerContractUiState(profile: TerritorialManagerProfileLike) {
  if (profile.relationship_type !== 'territorial_manager') return null;

  if (
    profile.contract_status === 'signed' &&
    profile.terms_version === TERRITORIAL_MANAGER_CONTRACT_VERSION &&
    Boolean(profile.contract_url)
  ) {
    return { key: 'formalized' as const, label: 'v1.2 formalizado', formalized: true, legacyInconsistent: false };
  }

  if (profile.contract_status === 'submitted') {
    return { key: 'in_review' as const, label: 'v1.2 em análise', formalized: false, legacyInconsistent: false };
  }

  if (profile.contract_status === 'available') {
    return { key: 'available' as const, label: 'v1.2 disponível', formalized: false, legacyInconsistent: false };
  }

  if (profile.contract_status === 'not_required' || profile.contract_status === 'signed') {
    return {
      key: 'legacy_inconsistent' as const,
      label: 'Inconsistência — v1.2 pendente',
      formalized: false,
      legacyInconsistent: true,
    };
  }

  return { key: 'pending' as const, label: 'v1.2 pendente', formalized: false, legacyInconsistent: false };
}

export function deriveTerritorialManagerFinancialActivation(
  assignments: TerritorialManagerAssignmentLike[],
  now = new Date(),
) {
  const current = assignments
    .filter(a => a.started_at <= now && (!a.ended_at || a.ended_at > now))
    .sort((a, b) => b.started_at.getTime() - a.started_at.getTime());

  const active = current.find(a => a.status === 'active');
  if (active) return { key: 'active' as const, label: 'Ativa', active: true, assignmentId: active.id };

  const suspended = current.find(a => a.status === 'suspended');
  if (suspended) return { key: 'suspended' as const, label: 'Suspensa', active: false, assignmentId: suspended.id };

  const pending = current.find(a => a.status === 'pending_approval');
  if (pending) return { key: 'pending_approval' as const, label: 'Pendente', active: false, assignmentId: pending.id };

  return { key: 'inactive' as const, label: 'Não ativa', active: false, assignmentId: null };
}

export function isLegacyPayoutMutationAllowedForRelationship(relationshipType?: string | null): boolean {
  return relationshipType !== 'territorial_manager';
}
