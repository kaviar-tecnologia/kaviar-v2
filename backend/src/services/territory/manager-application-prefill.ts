import { prisma } from '../../lib/prisma';

// A CRM application is not an approval to activate a manager or financial assignment.
// Only transfer known contact data from one unambiguously matched, approved application.
export interface ManagerCrmCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

type CandidateMatch =
  | { kind: 'matched'; lead: ManagerCrmCandidate }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

const REGISTRATION_APPROVED_STATUSES = new Set([
  'WAITING_DOCUMENTS',
  'WAITING_CONTRACT',
  'WAITING_APPROVAL',
  'ACTIVE',
]);

export function normalizedManagerName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizedManagerEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizedManagerPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return (digits.length === 10 || digits.length === 11) ? '55' + digits : digits;
}

export function selectApprovedManagerCandidate(
  candidates: ManagerCrmCandidate[],
  name: string,
  email: string,
): CandidateMatch {
  const matches = candidates.filter(candidate =>
    candidate.email &&
    normalizedManagerEmail(candidate.email) === normalizedManagerEmail(email) &&
    normalizedManagerName(candidate.name) === normalizedManagerName(name) &&
    REGISTRATION_APPROVED_STATUSES.has(candidate.status),
  );
  if (matches.length > 1) return { kind: 'ambiguous' };
  if (matches.length === 0) return { kind: 'none' };
  return { kind: 'matched', lead: matches[0] };
}

export async function findApprovedManagerCandidate(
  name: string,
  email: string,
): Promise<CandidateMatch> {
  const candidates = await prisma.crm_leads.findMany({
    where: {
      email: { equals: normalizedManagerEmail(email), mode: 'insensitive' },
      lead_type: 'TERRITORIAL_MANAGER',
      source: 'WEBSITE',
      deleted_at: null,
      status: { in: [...REGISTRATION_APPROVED_STATUSES] },
    },
    select: { id: true, name: true, email: true, phone: true, status: true },
  });
  return selectApprovedManagerCandidate(candidates, name, email);
}

export interface ManagerAccessIdentity {
  name: string;
  email: string;
  phone: string | null;
}

export interface ManagerContractProfileIdentity {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export function planManagerCandidatePrefill(
  lead: ManagerCrmCandidate,
  admin: ManagerAccessIdentity,
  profile: ManagerContractProfileIdentity,
): {
  conflicts: string[];
  profileChanges: { full_name?: string; email?: string; phone?: string };
  adminPhone: string | null;
} {
  const conflicts: string[] = [];
  const leadPhone = lead.phone?.trim() || null;
  const canonicalEmail = normalizedManagerEmail(admin.email);

  if (!lead.email || normalizedManagerEmail(lead.email) !== canonicalEmail ||
      normalizedManagerName(lead.name) !== normalizedManagerName(admin.name)) {
    conflicts.push('crm_identity');
  }
  if (profile.email && normalizedManagerEmail(profile.email) !== canonicalEmail) {
    conflicts.push('profile_email');
  }
  if (profile.full_name &&
      normalizedManagerName(profile.full_name) !== normalizedManagerName(lead.name)) {
    conflicts.push('profile_full_name');
  }
  if (leadPhone && admin.phone &&
      normalizedManagerPhone(leadPhone) !== normalizedManagerPhone(admin.phone)) {
    conflicts.push('admin_phone');
  }
  if (leadPhone && profile.phone &&
      normalizedManagerPhone(leadPhone) !== normalizedManagerPhone(profile.phone)) {
    conflicts.push('profile_phone');
  }
  if (conflicts.length) return { conflicts, profileChanges: {}, adminPhone: null };

  const profileChanges: { full_name?: string; email?: string; phone?: string } = {};
  if (!profile.full_name?.trim()) profileChanges.full_name = lead.name.trim();
  if (!profile.email?.trim()) profileChanges.email = canonicalEmail;
  if (leadPhone && !profile.phone?.trim()) profileChanges.phone = leadPhone;
  return {
    conflicts,
    profileChanges,
    adminPhone: leadPhone && !admin.phone?.trim() ? leadPhone : null,
  };
}
