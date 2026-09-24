import { TERRITORIAL_MANAGER_CONTRACT_VERSION } from './territorial-manager-contract-v1_2';

export type TerritorialManagerFinancialIneligibilityReason =
  | 'NO_PROFILE'
  | 'WRONG_RELATIONSHIP'
  | 'PROFILE_INACTIVE'
  | 'DOCUMENTS_NOT_VERIFIED'
  | 'CONTRACT_V1_2_NOT_FORMALIZED'
  | 'PIX_MISSING'
  | 'RESPONSIBILITY_TERMS_MISSING'
  | 'CONFIDENTIALITY_TERMS_MISSING';

export interface TerritorialManagerFinancialProfileLike {
  relationship_type?: string | null;
  is_active?: boolean | null;
  document_status?: string | null;
  contract_status?: string | null;
  terms_version?: string | null;
  contract_url?: string | null;
  pix_key?: string | null;
  responsibility_terms_accepted_at?: Date | string | null;
  confidentiality_terms_accepted_at?: Date | string | null;
}

export interface TerritorialManagerFinancialEligibility {
  eligible: boolean;
  reason: TerritorialManagerFinancialIneligibilityReason | null;
}

function hasText(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Canonical profile gate for the Gestor Territorial's 40% participation.
 *
 * Assignment/admin eligibility is checked by the caller because it is
 * time-dependent. This function covers the contractual/profile gates that
 * must be true at recognition time.
 */
export function evaluateTerritorialManagerFinancialProfile(
  profile?: TerritorialManagerFinancialProfileLike | null,
): TerritorialManagerFinancialEligibility {
  if (!profile) return { eligible: false, reason: 'NO_PROFILE' };
  if (profile.relationship_type !== 'territorial_manager') {
    return { eligible: false, reason: 'WRONG_RELATIONSHIP' };
  }
  if (!profile.is_active) return { eligible: false, reason: 'PROFILE_INACTIVE' };
  if (profile.document_status !== 'verified') {
    return { eligible: false, reason: 'DOCUMENTS_NOT_VERIFIED' };
  }
  if (
    profile.contract_status !== 'signed' ||
    profile.terms_version !== TERRITORIAL_MANAGER_CONTRACT_VERSION ||
    !hasText(profile.contract_url)
  ) {
    return { eligible: false, reason: 'CONTRACT_V1_2_NOT_FORMALIZED' };
  }
  if (!hasText(profile.pix_key)) return { eligible: false, reason: 'PIX_MISSING' };
  if (!profile.responsibility_terms_accepted_at) {
    return { eligible: false, reason: 'RESPONSIBILITY_TERMS_MISSING' };
  }
  if (!profile.confidentiality_terms_accepted_at) {
    return { eligible: false, reason: 'CONFIDENTIALITY_TERMS_MISSING' };
  }
  return { eligible: true, reason: null };
}

export function financialEligibilityReasonLabel(
  reason: TerritorialManagerFinancialIneligibilityReason | null,
): string | null {
  switch (reason) {
    case 'NO_PROFILE':
    case 'WRONG_RELATIONSHIP':
      return 'Bloqueada — perfil de Gestor';
    case 'PROFILE_INACTIVE':
      return 'Bloqueada — perfil inativo';
    case 'DOCUMENTS_NOT_VERIFIED':
      return 'Bloqueada — documentos';
    case 'CONTRACT_V1_2_NOT_FORMALIZED':
      return 'Bloqueada — contrato v1.2';
    case 'PIX_MISSING':
      return 'Bloqueada — Pix';
    case 'RESPONSIBILITY_TERMS_MISSING':
    case 'CONFIDENTIALITY_TERMS_MISSING':
      return 'Bloqueada — termos';
    default:
      return null;
  }
}
