import type { Prisma } from '@prisma/client';

export class CareAdminConflict extends Error {
  constructor(public readonly code: string = 'CARE_ADMIN_CONCURRENT_CHANGE') {
    super(code);
    this.name = 'CareAdminConflict';
  }
}

/**
 * Serialize CARE admin review and material edits on the same official row.
 * Explicit table names only: no dynamic SQL identifiers, no new schema.
 */
export async function lockCareAdminRow(
  tx: Prisma.TransactionClient,
  kind: 'regulation' | 'coverage' | 'enrollment' | 'driver' | 'neighborhood',
  id: string,
): Promise<void> {
  let rows: Array<{ id: string }>;
  switch (kind) {
    case 'regulation':
      rows = await tx.$queryRaw`SELECT id FROM municipal_regulations WHERE id = ${id} FOR UPDATE`;
      break;
    case 'coverage':
      rows = await tx.$queryRaw`SELECT id FROM operational_insurance_coverages WHERE id = ${id} FOR UPDATE`;
      break;
    case 'enrollment':
      rows = await tx.$queryRaw`SELECT id FROM driver_insurance_enrollments WHERE id = ${id} FOR UPDATE`;
      break;
    case 'driver':
      rows = await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${id} FOR UPDATE`;
      break;
    case 'neighborhood':
      rows = await tx.$queryRaw`SELECT id FROM neighborhoods WHERE id = ${id} FOR UPDATE`;
      break;
  }
  if (rows.length !== 1) throw new CareAdminConflict();
}

/** A read made before the lock must not authorize a write on a changed row. */
export function assertCareSnapshot(
  before: { updated_at: Date },
  locked: { updated_at: Date },
): void {
  if (!(before.updated_at instanceof Date) ||
      !(locked.updated_at instanceof Date) ||
      before.updated_at.getTime() !== locked.updated_at.getTime() ||
      JSON.stringify(before) !== JSON.stringify(locked)) {
    throw new CareAdminConflict();
  }
}

interface CareAuditInput {
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Mandatory CARE audit: failure aborts the SAME PostgreSQL transaction.
 * Only official identifiers, decisions and statuses; never clinical notes,
 * personal documents, full certificates, request/provider payloads or PII.
 * Unlike the global best-effort audit(), this function never swallows errors.
 */
export async function writeCareAdminAuditTx(
  tx: Prisma.TransactionClient,
  input: CareAuditInput,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO admin_audit_logs
      (admin_id, action, entity_type, entity_id, old_value, new_value, reason, ip_address, user_agent)
    VALUES (
      ${input.adminId}, ${input.action}, ${input.entityType}, ${input.entityId},
      ${JSON.stringify(input.oldValue)}::jsonb,
      ${JSON.stringify(input.newValue)}::jsonb,
      ${input.reason ?? null}, ${input.ipAddress ?? null}, ${input.userAgent ?? null}
    )`;
}
