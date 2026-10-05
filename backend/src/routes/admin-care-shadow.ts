import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { CARE_UNAVAILABLE_CODE } from '../services/care/care-readiness-policy';
import {
  runCareShadowAuditHarnessTx,
  type CareShadowAuditHarnessResult,
} from '../services/care/care-shadow-audit-harness';

const router = Router();

router.use(authenticateAdmin, requireSuperAdmin);

const DEFAULT_REASON = 'ADMIN_CARE_SHADOW_AUDIT_HARNESS';

function normalizeRequiredId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeReason(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_REASON;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : DEFAULT_REASON;
}

function serializeHarnessResult(result: CareShadowAuditHarnessResult) {
  return {
    version: result.version,
    harnessOnly: true,
    auditWritten: result.auditWritten,
    publicCode: CARE_UNAVAILABLE_CODE,
    operationAllowed: false,
    dispatchAllowed: false,
    acceptanceAllowed: false,
    walletAllowed: false,
    decision: {
      shadowOnly: true,
      status: result.decision.status,
      shadowEnabled: result.decision.shadowEnabled,
      reasons: result.decision.reasons,
      publicCode: CARE_UNAVAILABLE_CODE,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      auditEvent: result.decision.auditEvent,
    },
  };
}

/**
 * CARE-501: protected SUPER_ADMIN internal entry for CARE shadow audit harness.
 *
 * This route only triggers the shadow-only harness and writes an audit trace.
 * It does not create CARE rides, does not dispatch, does not accept offers,
 * does not price, does not touch wallet and does not enable public CARE.
 */
router.post('/harness', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin as { id?: string; email?: string; role?: string } | undefined;
    const adminId = normalizeRequiredId(admin?.id);
    if (!adminId) {
      return res.status(401).json({ success: false, error: 'ADMIN_CONTEXT_MISSING' });
    }

    const rideId = normalizeRequiredId(req.body?.rideId);
    const driverId = normalizeRequiredId(req.body?.driverId);

    if (!rideId || !driverId) {
      return res.status(400).json({
        success: false,
        error: 'CARE_SHADOW_HARNESS_INPUT_INVALID',
        required: ['rideId', 'driverId'],
      });
    }

    const result = await prisma.$transaction((tx) =>
      runCareShadowAuditHarnessTx(tx, {
        rideId,
        driverId,
        externalEvidence: req.body?.externalEvidence ?? null,
        now: new Date(),
        adminId,
        reason: normalizeReason(req.body?.reason),
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }),
    );

    return res.json({
      success: true,
      data: serializeHarnessResult(result),
    });
  } catch (_err) {
    return res.status(500).json({
      success: false,
      error: 'CARE_SHADOW_HARNESS_FAILED',
    });
  }
});

export default router;
