import { PrismaClient, accounting_document_scan_status } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Scope check: verify the accountant has an active link to the legal entity.
 * Supports parent inheritance (MATRIZ → FILIAL).
 * Returns the link if valid, null otherwise.
 */
export async function verifyEntityAccess(accountantId: string, legalEntityId: string) {
  const now = new Date();
  const whereBase = {
    accountant_id: accountantId,
    status: 'ACTIVE' as const,
    starts_at: { lte: now },
    OR: [{ ends_at: null }, { ends_at: { gt: now } }],
  };

  // 1. Direct link
  let link = await prisma.accountant_entity_links.findFirst({
    where: { ...whereBase, legal_entity_id: legalEntityId },
  });

  // 2. Check parent inheritance
  if (!link) {
    const entity = await prisma.legal_entities.findUnique({
      where: { id: legalEntityId },
      select: { parent_entity_id: true },
    });
    if (entity?.parent_entity_id) {
      link = await prisma.accountant_entity_links.findFirst({
        where: { ...whereBase, legal_entity_id: entity.parent_entity_id, inherits_children: true },
      });
    }
  }

  return link;
}

/**
 * Get all legal_entity_ids accessible to the accountant (for list queries).
 */
export async function getAccessibleEntityIds(accountantId: string): Promise<string[]> {
  const now = new Date();
  const links = await prisma.accountant_entity_links.findMany({
    where: {
      accountant_id: accountantId,
      status: 'ACTIVE',
      starts_at: { lte: now },
      OR: [{ ends_at: null }, { ends_at: { gt: now } }],
    },
    select: { legal_entity_id: true, inherits_children: true },
  });

  const entityIds = new Set<string>();
  for (const link of links) {
    entityIds.add(link.legal_entity_id);
    // If inherits children, add all filiais
    if (link.inherits_children) {
      const children = await prisma.legal_entities.findMany({
        where: { parent_entity_id: link.legal_entity_id, is_active: true },
        select: { id: true },
      });
      for (const child of children) {
        entityIds.add(child.id);
      }
    }
  }

  return [...entityIds];
}

/**
 * Get the current (latest valid) file for a document.
 * Excludes INFECTED files.
 */
export async function getCurrentFile(documentId: string) {
  return prisma.accounting_company_document_files.findFirst({
    where: {
      document_id: documentId,
      scan_status: { not: accounting_document_scan_status.INFECTED },
    },
    orderBy: { version_number: 'desc' },
  });
}

/**
 * Get next version number for a document.
 */
export async function getNextVersionNumber(documentId: string): Promise<number> {
  const latest = await prisma.accounting_company_document_files.findFirst({
    where: { document_id: documentId },
    orderBy: { version_number: 'desc' },
    select: { version_number: true },
  });
  return (latest?.version_number ?? 0) + 1;
}

/**
 * Compute temporal status from expires_at.
 */
export function computeTemporalStatus(
  expiresAt: Date | null,
  renewalAlertDays: number | null
): 'NO_EXPIRY' | 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' {
  if (!expiresAt) return 'NO_EXPIRY';

  const now = new Date();
  if (expiresAt < now) return 'EXPIRED';

  const alertDays = renewalAlertDays ?? 30;
  const alertMs = alertDays * 24 * 60 * 60 * 1000;
  const alertDate = new Date(expiresAt.getTime() - alertMs);

  if (now >= alertDate) return 'EXPIRING_SOON';
  return 'VALID';
}

export { prisma };
