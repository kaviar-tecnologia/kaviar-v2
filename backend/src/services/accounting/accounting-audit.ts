import { Prisma } from '@prisma/client';

interface AccountingAuditInput {
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

const SENSITIVE_FIELDS = ['password', 'cpf', 'token', 'token_hash', 'secret'];

function sanitize(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const out: any = { ...data };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      out[key] = '[REDACTED]';
    }
  }
  return out;
}

export async function writeAccountingAuditTx(
  tx: Prisma.TransactionClient,
  input: AccountingAuditInput
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, old_value, new_value, reason, ip_address, user_agent)
    VALUES (
      ${input.adminId},
      ${input.action},
      ${input.entityType},
      ${input.entityId},
      ${input.oldValue ? JSON.stringify(sanitize(input.oldValue)) : null}::jsonb,
      ${input.newValue ? JSON.stringify(sanitize(input.newValue)) : null}::jsonb,
      ${input.reason || null},
      ${input.ipAddress || null},
      ${input.userAgent || null}
    )`;
}
