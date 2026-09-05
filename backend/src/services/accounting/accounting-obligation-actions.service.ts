/**
 * Shared business logic for company-side obligation payment actions.
 *
 * Extracted from public-obligations.ts so BOTH the public (token) flow and the
 * authenticated admin (KAVIAR) flow share EXACTLY the same:
 *   - state-machine validation (allowed source statuses)
 *   - status/action_owner transitions and timestamps
 *   - audit trail writes
 *
 * This does NOT introduce a new lifecycle or model — it reuses
 * accounting_payment_obligations and the existing audit trail. The status
 * targets here (PAID, PROOF_UPLOADED) are the same ones present in
 * VALID_TRANSITIONS; the company-facing entry points intentionally expose only
 * the subset of transitions the company/KAVIAR may perform.
 */
import { prisma, auditObligation } from './accounting-obligation-tokens.service';

// Upload constraints for payment proof — identical to the public flow.
// (Kept here so admin and public share one source of truth.)
export const PROOF_ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** Actor performing the action. `type` follows the existing audit convention. */
export interface ObligationActor {
  type: 'COMPANY' | 'ACCOUNTANT' | 'SYSTEM';
  id?: string;
  ip?: string;
  userAgent?: string;
  /** Optional extra attribution (e.g. admin id/email) merged into audit details. */
  extraDetails?: Record<string, any>;
}

export class ObligationActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ObligationActionError';
    this.status = status;
  }
}

// Company may inform payment only from these statuses (same as public mark-paid).
const MARK_PAID_ALLOWED = ['VIEWED', 'SCHEDULED'];
// Proof may be uploaded only after payment informed / after rejection (same as public).
const PROOF_ALLOWED_SOURCE = ['PAID', 'REJECTED'];

/**
 * Mark an obligation as PAID (payment informed by the company/KAVIAR).
 * Validates the current status against the allowed set, updates the row and
 * writes the PAYMENT_INFORMED audit event. Returns the updated obligation.
 *
 * Throws ObligationActionError(400) if the current status does not allow it.
 */
export async function markObligationPaid(params: {
  obligation: { id: string; status: string };
  paidDate?: string | null;
  actor: ObligationActor;
}) {
  const { obligation, paidDate, actor } = params;

  if (!MARK_PAID_ALLOWED.includes(obligation.status)) {
    throw new ObligationActionError(
      `Não é possível marcar como pago no status atual: ${obligation.status}`
    );
  }

  const paidAt = paidDate ? new Date(paidDate + 'T12:00:00Z') : new Date();

  const updated = await prisma.accounting_payment_obligations.update({
    where: { id: obligation.id },
    data: { status: 'PAID', paid_at: paidAt, action_owner: 'COMPANY' },
  });

  await auditObligation({
    obligationId: obligation.id,
    action: 'PAYMENT_INFORMED',
    actorType: actor.type,
    actorId: actor.id,
    details: {
      paid_date: paidDate || new Date().toISOString().slice(0, 10),
      ...(actor.extraDetails || {}),
    },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return updated;
}

/**
 * Validate that proof upload is permitted for the given source status.
 * Call this BEFORE accepting/streaming the file to avoid storing files for
 * obligations that cannot receive a proof.
 *
 * Throws ObligationActionError(400) if not allowed.
 */
export function assertProofUploadAllowed(currentStatus: string) {
  if (!PROOF_ALLOWED_SOURCE.includes(currentStatus)) {
    throw new ObligationActionError(
      'Envio de comprovante só é permitido após informar o pagamento'
    );
  }
}

/**
 * Record that a payment proof file has been uploaded.
 * Sets PROOF_UPLOADED + action_owner=ACCOUNTANT (contador verifica depois),
 * stores file references and writes the PROOF_UPLOADED audit event.
 *
 * The actual S3 upload is performed by the caller (request-bound multer);
 * this function only persists the references + transitions the state, so both
 * public and admin flows converge on the same rules.
 */
export async function recordProofUploaded(params: {
  obligationId: string;
  currentStatus: string;
  file: { storageKey: string; filename: string; mimeType: string; sizeBytes: number };
  actor: ObligationActor;
}) {
  const { obligationId, currentStatus, file, actor } = params;

  // Defensive re-validation (caller should have checked before upload).
  assertProofUploadAllowed(currentStatus);

  if (!file?.storageKey) {
    throw new ObligationActionError('Nenhum arquivo enviado');
  }

  const updated = await prisma.accounting_payment_obligations.update({
    where: { id: obligationId },
    data: {
      proof_storage_key: file.storageKey,
      proof_filename: file.filename,
      proof_mime_type: file.mimeType,
      proof_size_bytes: file.sizeBytes,
      proof_uploaded_at: new Date(),
      status: 'PROOF_UPLOADED',
      action_owner: 'ACCOUNTANT',
    },
  });

  await auditObligation({
    obligationId,
    action: 'PROOF_UPLOADED',
    actorType: actor.type,
    actorId: actor.id,
    details: {
      filename: file.filename,
      size: file.sizeBytes,
      ...(actor.extraDetails || {}),
    },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return updated;
}
