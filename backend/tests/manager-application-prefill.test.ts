import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    crm_leads: { findMany: vi.fn() },
    crm_interactions: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
import {
  findApprovedManagerCandidate,
  hasApprovedOnboardingDecision,
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
  approvalDecisionVerified: true,
};

const admin = {
  name: 'Candidata Exemplo',
  email: 'candidata@example.com',
  phone: null,
};
const emptyProfile = { full_name: null, email: null, phone: null };

describe('manager CRM application prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.crm_leads.findMany.mockResolvedValue([candidate]);
    prismaMock.crm_interactions.findFirst.mockResolvedValue({
      description: JSON.stringify({ schema: 'manager_application_decision_v1', outcome: 'APPROVE_ONBOARDING' }),
    });
  });

  it('queries one original WEBSITE application and verifies its latest CRM decision', async () => {
    const result = await findApprovedManagerCandidate(candidate.name, candidate.email!);
    expect(result).toMatchObject({ kind: 'matched', lead: { id: candidate.id } });
    expect(prismaMock.crm_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        lead_type: 'TERRITORIAL_MANAGER', source: 'WEBSITE', deleted_at: null,
        email: { equals: candidate.email, mode: 'insensitive' },
      }),
    }));
    expect(prismaMock.crm_interactions.findFirst).toHaveBeenCalledWith({
      where: { lead_id: candidate.id, event_type: 'DECISION' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: { description: true },
    });
  });

  it('rejects an approval status without an audited decision', async () => {
    prismaMock.crm_interactions.findFirst.mockResolvedValue(null);
    expect(await findApprovedManagerCandidate(candidate.name, candidate.email!)).toEqual({ kind: 'none' });
    prismaMock.crm_interactions.findFirst.mockResolvedValue({
      description: JSON.stringify({ schema: 'manager_application_decision_v1', outcome: 'KEEP_REVIEW' }),
    });
    expect(await findApprovedManagerCandidate(candidate.name, candidate.email!)).toEqual({ kind: 'none' });
  });

  it('rejects duplicates before reading a decision, even if one is not approved', async () => {
    prismaMock.crm_leads.findMany.mockResolvedValue([
      candidate, { ...candidate, id: 'duplicate', status: 'INTERESTED' },
    ]);
    expect(await findApprovedManagerCandidate(candidate.name, candidate.email!)).toEqual({ kind: 'ambiguous' });
    expect(prismaMock.crm_interactions.findFirst).not.toHaveBeenCalled();
  });

  it('matches only one approved website application by exact name and primary email', () => {
    const result = selectApprovedManagerCandidate([candidate], ' Candidata  Exemplo ', 'CANDIDATA@example.com');
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.lead.id).toBe(candidate.id);
    expect(selectApprovedManagerCandidate([candidate], 'Outra Pessoa', candidate.email!)).toEqual({ kind: 'none' });
    expect(selectApprovedManagerCandidate([candidate], candidate.name, 'alternativo@example.com')).toEqual({ kind: 'none' });
    expect(selectApprovedManagerCandidate([{ ...candidate, approvalDecisionVerified: false }], candidate.name, candidate.email!)).toEqual({ kind: 'none' });
  });

  it('refuses ambiguous and non-approved matches', () => {
    expect(selectApprovedManagerCandidate([candidate, { ...candidate, id: 'lead-duplicate' }], candidate.name, candidate.email!)).toEqual({ kind: 'ambiguous' });
    expect(selectApprovedManagerCandidate([{ ...candidate, status: 'INTERESTED' }], candidate.name, candidate.email!)).toEqual({ kind: 'none' });
    expect(selectApprovedManagerCandidate([candidate, { ...candidate, id: 'pending-duplicate', status: 'INTERESTED' }], candidate.name, candidate.email!)).toEqual({ kind: 'ambiguous' });
  });

  it('requires the exact latest audited approval event, not a manually changed CRM status', () => {
    expect(hasApprovedOnboardingDecision(JSON.stringify({
      schema: 'manager_application_decision_v1', outcome: 'APPROVE_ONBOARDING',
    }))).toBe(true);
    expect(hasApprovedOnboardingDecision(JSON.stringify({
      schema: 'manager_application_decision_v1', outcome: 'ADVANCE',
    }))).toBe(false);
    expect(hasApprovedOnboardingDecision(JSON.stringify({
      schema: 'unrelated', outcome: 'APPROVE_ONBOARDING',
    }))).toBe(false);
    expect(hasApprovedOnboardingDecision('{invalid json')).toBe(false);
    expect(hasApprovedOnboardingDecision(null)).toBe(false);
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
