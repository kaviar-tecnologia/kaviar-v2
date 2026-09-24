import { describe, expect, it } from 'vitest';
import {
  deriveTerritorialManagerContractUiState,
  deriveTerritorialManagerFinancialActivation,
  isLegacyPayoutMutationAllowedForRelationship,
} from '../src/services/contracts/territorial-manager-profile-state';

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

  it('separates financial activation from operational profile state', () => {
    const now = new Date('2026-09-24T17:00:00Z');

    expect(deriveTerritorialManagerFinancialActivation([
      {
        id: 'pending',
        status: 'pending_approval',
        started_at: new Date('2026-09-01T00:00:00Z'),
        ended_at: null,
      },
    ], now)).toMatchObject({
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
    ], now)).toMatchObject({
      key: 'active',
      active: true,
      assignmentId: 'active',
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
    ], now)).toMatchObject({
      key: 'inactive',
      active: false,
      assignmentId: null,
    });
  });

  it('makes legacy payout mutations read-only for territorial managers', () => {
    expect(isLegacyPayoutMutationAllowedForRelationship('territorial_manager')).toBe(false);
    expect(isLegacyPayoutMutationAllowedForRelationship('territorial_operator')).toBe(true);
    expect(isLegacyPayoutMutationAllowedForRelationship('association_partner')).toBe(true);
  });
});
