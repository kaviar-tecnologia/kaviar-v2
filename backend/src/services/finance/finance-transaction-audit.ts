/**
 * Atomic audit for manual financial transactions.
 *
 * writeFinanceTransactionAuditTx runs INSIDE a Prisma transaction —
 * if the INSERT fails, the entire financial operation rolls back.
 *
 * Never use try/catch around the audit INSERT. Errors must propagate.
 */
import { Prisma } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FinanceTransactionAuditContext {
  adminId: string;
  adminEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface FinanceTransactionAuditInput {
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

// ── Sensitive field redaction ─────────────────────────────────────────────────

const SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'token',
  'secret',
  'api_key',
  'medicalnotes',
  'emergencycontact',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_FIELDS.some((f) => lower === f);
}

// ── Safe serialization for JSONB ─────────────────────────────────────────────

/**
 * Recursively serializes a value for safe JSONB storage.
 * - BigInt → string
 * - Date → ISO string
 * - null → null
 * - undefined → omitted from objects
 * - Sensitive keys → '[REDACTED]'
 * - Arrays → recursively processed
 * - Objects → recursively processed
 */
export function safeSerializeForAudit(value: unknown): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;

  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => safeSerializeForAudit(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined) continue; // omit undefined
      if (isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = safeSerializeForAudit(val);
      }
    }
    return result;
  }

  // primitives (string, number, boolean)
  return value;
}

// ── Atomic audit INSERT ──────────────────────────────────────────────────────

/**
 * Inserts an audit log row inside a Prisma transaction.
 * If this fails, the entire transaction rolls back — no partial state.
 *
 * NEVER wrap this in try/catch. Let errors propagate.
 */
export async function writeFinanceTransactionAuditTx(
  tx: Prisma.TransactionClient,
  context: FinanceTransactionAuditContext,
  input: FinanceTransactionAuditInput,
): Promise<void> {
  const oldJson: string | null = input.oldValue != null
    ? JSON.stringify(safeSerializeForAudit(input.oldValue))
    : null;
  const newJson: string | null = input.newValue != null
    ? JSON.stringify(safeSerializeForAudit(input.newValue))
    : null;

  await tx.$executeRaw`
    INSERT INTO admin_audit_logs
      (admin_id, admin_email, action, entity_type, entity_id, old_value, new_value, reason, ip_address, user_agent)
    VALUES (
      ${context.adminId},
      ${context.adminEmail ?? null},
      ${input.action},
      ${input.entityType},
      ${input.entityId},
      ${oldJson}::jsonb,
      ${newJson}::jsonb,
      ${input.reason ?? null},
      ${context.ipAddress ?? null},
      ${context.userAgent ?? null}
    )
  `;
}
