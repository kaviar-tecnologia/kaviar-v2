import { describe, expect, it } from 'vitest';
import {
  deriveTerritorialManagerContractUiState,
  deriveTerritorialManagerFinancialActivation,
  isLegacyPayoutMutationAllowedForRelationship,
} from '../src/services/contracts/territorial-manager-profile-state';
import { evaluateTerritorialManagerFinancialProfile } from '../src/services/contracts/territorial-manager-financial-eligibility';

const fullyEligibleProfile = {
  relationship_type: 'territorial_manager',
  is_active: true,
  document_status: 'verified',
  contract_status: 'signed',
  terms_version: 'v1.2',
  contract_url: 'contract-submissions/manager.pdf',
  pix_key: '11999999999',
  responsibility_terms_accepted_at: new Date('2026-09-01T00:00:00Z'),
  confidentiality_terms_accepted_at: new Date('2026-09-01T00:00:00Z'),
};

describe('territorial manager v1.2 profile state', () => {
  it('marks a canonical signed v1.2 PDF as formalized', () => {
    expect(deriveTerritorialManagerContractUiState({
      relationship_type: 'territorial_manager',
      contract_status: 'signed',
      terms_version: 'v1.2',
      contract_url: 'contract-submissions/manager.pdf',
    })).toMatchObject({
      key: 'formalized',
      label: 'v1.2 formalizado',
      formalized: true,
      legacyInconsistent: false,
    });
  });

  it('flags legacy signed and not_required manager states as inconsistent', () => {
    expect(deriveTerritorialManagerContractUiState({
      relationship_type: 'territorial_manager',
      contract_status: 'signed',
      terms_version: 'v1.0',
      contract_url: null,
    })?.key).toBe('legacy_inconsistent');

    expect(deriveTerritorialManagerContractUiState({
      relationship_type: 'territorial_manager',
      contract_status: 'not_required',
      terms_version: null,
      contract_url: null,
    })?.key).toBe('legacy_inconsistent');
  });

  it('keeps operator profiles outside manager v1.2 interpretation', () => {
    expect(deriveTerritorialManagerContractUiState({
      relationship_type: 'territorial_operator',
      contract_status: 'signed',
      terms_version: 'v1.0',
      contract_url: null,
    })).toBeNull();
  });

  it('separates assignment state from contractual financial eligibility', () => {
    const now = new Date('2026-09-24T17:00:00Z');

    expect(deriveTerritorialManagerFinancialActivation([
      {
        id: 'pending',
        status: 'pending_approval',
        started_at: new Date('2026-09-01T00:00:00Z'),
        ended_at: null,
      },
    ], fullyEligibleProfile, now)).toMatchObject({
      key: 'pending_approval',
      active: false,
      assignmentId: 'pending',
    });

    expect(deriveTerritorialManagerFinancialActivation([
      {
        id: 'active',
        status: 'active',
        started_at: new Date('2026-09-01T00:00:00Z'),
        ended_at: null,
      },
    ], fullyEligibleProfile, now)).toMatchObject({
      key: 'active',
      active: true,
      assignmentId: 'active',
    });

    expect(deriveTerritorialManagerFinancialActivation([
      {
        id: 'active-contract-pending',
        status: 'active',
        started_at: new Date('2026-09-01T00:00:00Z'),
        ended_at: null,
      },
    ], {
      ...fullyEligibleProfile,
      contract_status: 'pending',
      terms_version: null,
      contract_url: null,
    }, now)).toMatchObject({
      key: 'blocked',
      label: 'Bloqueada — contrato v1.2',
      active: false,
      assignmentId: 'active-contract-pending',
      reason: 'CONTRACT_V1_2_NOT_FORMALIZED',
    });
  });

  it('ignores future or ended assignments', () => {
    const now = new Date('2026-09-24T17:00:00Z');
    expect(deriveTerritorialManagerFinancialActivation([
      {
        id: 'future',
        status: 'active',
        started_at: new Date('2026-10-01T00:00:00Z'),
        ended_at: null,
      },
      {
        id: 'ended',
        status: 'active',
        started_at: new Date('2026-08-01T00:00:00Z'),
        ended_at: new Date('2026-09-01T00:00:00Z'),
      },
    ], fullyEligibleProfile, now)).toMatchObject({
      key: 'inactive',
      active: false,
      assignmentId: null,
    });
  });

  it('requires every canonical profile gate before allowing the 40% share', () => {
    expect(evaluateTerritorialManagerFinancialProfile(fullyEligibleProfile)).toEqual({
      eligible: true,
      reason: null,
    });

    expect(evaluateTerritorialManagerFinancialProfile({
      ...fullyEligibleProfile,
      contract_status: 'pending',
      terms_version: null,
      contract_url: null,
    })).toEqual({
      eligible: false,
      reason: 'CONTRACT_V1_2_NOT_FORMALIZED',
    });

    expect(evaluateTerritorialManagerFinancialProfile({
      ...fullyEligibleProfile,
      is_active: false,
    })).toEqual({
      eligible: false,
      reason: 'PROFILE_INACTIVE',
    });
  });

  it('makes legacy payout mutations read-only for territorial managers', () => {
    expect(isLegacyPayoutMutationAllowedForRelationship('territorial_manager')).toBe(false);
    expect(isLegacyPayoutMutationAllowedForRelationship('territorial_operator')).toBe(true);
    expect(isLegacyPayoutMutationAllowedForRelationship('association_partner')).toBe(true);
  });
});
