/**
 * Tests — accounting-obligation-actions.service (lógica compartilhada).
 *
 * Cobre a lógica reutilizada pelo fluxo público (token) e pelo fluxo admin (KAVIAR):
 *  - markObligationPaid: transições permitidas / bloqueadas + audit;
 *  - assertProofUploadAllowed: estados válidos/ inválidos;
 *  - recordProofUploaded: PAID → PROOF_UPLOADED com arquivo, sem arquivo bloqueado, audit;
 *  - PROOF_ALLOWED_MIME.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, auditSpy } = vi.hoisted(() => {
  const prismaMock: any = {
    accounting_payment_obligations: { update: vi.fn() },
  };
  return { prismaMock, auditSpy: vi.fn(async () => {}) };
});

vi.mock('../src/services/accounting/accounting-obligation-tokens.service', () => ({
  prisma: prismaMock,
  auditObligation: auditSpy,
}));

const {
  markObligationPaid,
  recordProofUploaded,
  assertProofUploadAllowed,
  ObligationActionError,
  PROOF_ALLOWED_MIME,
} = await import('../src/services/accounting/accounting-obligation-actions.service');

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.accounting_payment_obligations.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));
});

describe('markObligationPaid', () => {
  it('VIEWED → PAID grava e audita PAYMENT_INFORMED', async () => {
    const updated = await markObligationPaid({
      obligation: { id: 'ob-1', status: 'VIEWED' },
      paidDate: '2026-09-04',
      actor: { type: 'COMPANY', id: 'admin-1', extraDetails: { channel: 'ADMIN' } },
    });
    expect(updated.status).toBe('PAID');
    expect(updated.action_owner).toBe('COMPANY');
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0][0].action).toBe('PAYMENT_INFORMED');
    expect(auditSpy.mock.calls[0][0].details.channel).toBe('ADMIN');
  });

  it('SCHEDULED → PAID permitido', async () => {
    const updated = await markObligationPaid({
      obligation: { id: 'ob-1', status: 'SCHEDULED' },
      actor: { type: 'COMPANY' },
    });
    expect(updated.status).toBe('PAID');
  });

  it('DRAFT → PAID lança ObligationActionError(400) e não grava', async () => {
    await expect(markObligationPaid({ obligation: { id: 'ob-1', status: 'DRAFT' }, actor: { type: 'COMPANY' } }))
      .rejects.toMatchObject({ name: 'ObligationActionError', status: 400 });
    expect(prismaMock.accounting_payment_obligations.update).not.toHaveBeenCalled();
  });

  it('PAID → PAID (estado já pago) bloqueado', async () => {
    await expect(markObligationPaid({ obligation: { id: 'ob-1', status: 'PAID' }, actor: { type: 'COMPANY' } }))
      .rejects.toBeInstanceOf(ObligationActionError);
  });
});

describe('assertProofUploadAllowed', () => {
  it('permite PAID e REJECTED', () => {
    expect(() => assertProofUploadAllowed('PAID')).not.toThrow();
    expect(() => assertProofUploadAllowed('REJECTED')).not.toThrow();
  });
  it('bloqueia VIEWED / DRAFT / PROOF_UPLOADED', () => {
    for (const s of ['VIEWED', 'DRAFT', 'PROOF_UPLOADED', 'SCHEDULED']) {
      expect(() => assertProofUploadAllowed(s)).toThrow(ObligationActionError);
    }
  });
});

describe('recordProofUploaded', () => {
  const file = { storageKey: 'accounting-proofs/ob-1/x.pdf', filename: 'comprovante.pdf', mimeType: 'application/pdf', sizeBytes: 1234 };

  it('PAID → PROOF_UPLOADED com arquivo grava e audita', async () => {
    const updated = await recordProofUploaded({
      obligationId: 'ob-1', currentStatus: 'PAID', file,
      actor: { type: 'COMPANY', id: 'admin-1', extraDetails: { channel: 'ADMIN' } },
    });
    expect(updated.status).toBe('PROOF_UPLOADED');
    expect(updated.action_owner).toBe('ACCOUNTANT');
    expect(updated.proof_storage_key).toBe(file.storageKey);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0][0].action).toBe('PROOF_UPLOADED');
    expect(auditSpy.mock.calls[0][0].actorType).toBe('COMPANY');
  });

  it('estado inválido (VIEWED) bloqueia e não grava', async () => {
    await expect(recordProofUploaded({ obligationId: 'ob-1', currentStatus: 'VIEWED', file, actor: { type: 'COMPANY' } }))
      .rejects.toBeInstanceOf(ObligationActionError);
    expect(prismaMock.accounting_payment_obligations.update).not.toHaveBeenCalled();
  });

  it('sem arquivo (storageKey vazio) bloqueia', async () => {
    await expect(recordProofUploaded({
      obligationId: 'ob-1', currentStatus: 'PAID',
      file: { storageKey: '', filename: '', mimeType: '', sizeBytes: 0 },
      actor: { type: 'COMPANY' },
    })).rejects.toBeInstanceOf(ObligationActionError);
    expect(prismaMock.accounting_payment_obligations.update).not.toHaveBeenCalled();
  });
});

describe('PROOF_ALLOWED_MIME', () => {
  it('aceita PDF/JPEG/PNG e rejeita outros', () => {
    expect(PROOF_ALLOWED_MIME.has('application/pdf')).toBe(true);
    expect(PROOF_ALLOWED_MIME.has('image/jpeg')).toBe(true);
    expect(PROOF_ALLOWED_MIME.has('image/png')).toBe(true);
    expect(PROOF_ALLOWED_MIME.has('application/x-msdownload')).toBe(false);
    expect(PROOF_ALLOWED_MIME.has('text/html')).toBe(false);
  });
});
