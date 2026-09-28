import { describe, expect, it } from 'vitest';
import {
  planManagerCandidatePrefill,
  selectApprovedManagerCandidate,
  type ManagerCrmCandidate,
} from '../src/services/territory/manager-application-prefill';

const candidate: ManagerCrmCandidate = {
  id: 'lead-example',
  name: 'Candidata Exemplo',
  email: 'candidata@example.com',
  phone: '(21) 99999-0000',
  status: 'WAITING_DOCUMENTS',
};

const admin = {
  name: 'Candidata Exemplo',
  email: 'candidata@example.com',
  phone: null,
};
const emptyProfile = { full_name: null, email: null, phone: null };

describe('manager CRM application prefill', () => {
  it('matches only one approved website application by exact name and primary email', () => {
    const result = selectApprovedManagerCandidate([candidate], ' Candidata  Exemplo ', 'CANDIDATA@example.com');
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.lead.id).toBe(candidate.id);
    expect(selectApprovedManagerCandidate([candidate], 'Outra Pessoa', candidate.email!)).toEqual({ kind: 'none' });
    expect(selectApprovedManagerCandidate([candidate], candidate.name, 'alternativo@example.com')).toEqual({ kind: 'none' });
  });

  it('refuses ambiguous and non-approved matches', () => {
    expect(selectApprovedManagerCandidate([candidate, { ...candidate, id: 'lead-duplicate' }], candidate.name, candidate.email!)).toEqual({ kind: 'ambiguous' });
    expect(selectApprovedManagerCandidate([{ ...candidate, status: 'INTERESTED' }], candidate.name, candidate.email!)).toEqual({ kind: 'none' });
  });

  it('copies only empty identity/contact fields without changing activation or contract', () => {
    const plan = planManagerCandidatePrefill(candidate, admin, emptyProfile);
    expect(plan.conflicts).toEqual([]);
    expect(plan.profileChanges).toEqual({
      full_name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
    });
    expect(plan.adminPhone).toBe(candidate.phone);
    expect(Object.keys(plan.profileChanges).sort()).toEqual(['email', 'full_name', 'phone']);
  });

  it('is idempotent when CRM information is already recorded', () => {
    const plan = planManagerCandidatePrefill(
      candidate,
      { ...admin, phone: '+55 21 99999-0000' },
      { full_name: candidate.name, email: candidate.email, phone: '21999990000' },
    );
    expect(plan).toEqual({ conflicts: [], profileChanges: {}, adminPhone: null });
  });

  it('blocks silent replacement of conflicting contract data', () => {
    const conflict = planManagerCandidatePrefill(
      candidate,
      admin,
      { ...emptyProfile, phone: '21988880000' },
    );
    expect(conflict.conflicts).toContain('profile_phone');
    expect(conflict.profileChanges).toEqual({});
    expect(conflict.adminPhone).toBeNull();
    expect(planManagerCandidatePrefill(candidate, { ...admin, email: 'outro@example.com' }, emptyProfile).conflicts).toContain('crm_identity');
  });
});
