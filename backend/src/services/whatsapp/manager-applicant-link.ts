import { prisma } from '../../lib/prisma';

/** Keep the same strict full-number normalization for CRM, Twilio and invite logs. */
export function normalizeManagerPhone(input: unknown): string | null {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return '+55' + digits;
}

export function managerPhoneVariants(input: unknown): string[] {
  const normalized = normalizeManagerPhone(input);
  if (!normalized) return [];
  const national = normalized.slice(3);
  return [normalized, normalized.slice(1), national];
}

/**
 * Fail closed: a response is associated with a Gestor application only when
 * exactly one active, original WEBSITE candidate has this full phone AND the
 * official application template was sent to that same normalized phone.
 * Manual SUPPORT_POINT leads and suffix-only matches are never selected.
 */
export async function resolveInvitedManagerApplicant(
  input: unknown,
  db: Pick<typeof prisma, 'crm_leads' | 'whatsapp_invite_logs'> = prisma,
): Promise<{ id: string; name: string } | null> {
  const phone = normalizeManagerPhone(input);
  if (!phone) return null;
  const variants = managerPhoneVariants(phone);
  const candidates = await db.crm_leads.findMany({
    where: {
      deleted_at: null,
      lead_type: 'TERRITORIAL_MANAGER',
      source: 'WEBSITE',
      phone: { in: variants },
    },
    select: { id: true, name: true, phone: true },
    take: 3,
  });
  const exact = candidates.filter((candidate) => normalizeManagerPhone(candidate.phone) === phone);
  if (exact.length !== 1) return null;
  const confirmedInvitation = await db.whatsapp_invite_logs.findFirst({
    where: {
      target_phone_normalized: phone,
      invite_type: 'manager_application',
      twilio_status: { notIn: ['failed', 'undelivered'] },
    },
    select: { id: true },
    orderBy: { created_at: 'desc' },
  });
  if (!confirmedInvitation) return null;
  return { id: exact[0].id, name: exact[0].name };
}
