import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { CARE_UNAVAILABLE_CODE } from '../services/care/care-readiness-policy';
import {
  CARE_ELIGIBILITY_SHADOW_AUDIT_ACTION,
  CARE_ELIGIBILITY_SHADOW_AUDIT_ENTITY_TYPE,
} from '../services/care/care-eligibility-shadow-mode';
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


interface CareShadowAuditLogRow {
  id: number | string;
  adminId: string | null;
  adminEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | string | null;
}

function normalizeOptionalText(value: unknown, max = 200): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function parseBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function serializeAuditLog(row: CareShadowAuditLogRow) {
  return {
    id: String(row.id),
    adminId: row.adminId,
    adminEmail: row.adminEmail,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldValue: row.oldValue,
    newValue: row.newValue,
    reason: row.reason,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    readOnly: true,
    careShadow: true,
    publicCode: CARE_UNAVAILABLE_CODE,
    operationAllowed: false,
    dispatchAllowed: false,
    acceptanceAllowed: false,
    walletAllowed: false,
  };
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
 * CARE-503: read-only SUPER_ADMIN audit trail for CARE shadow decisions.
 *
 * This endpoint only reads CARE shadow audit rows already persisted in
 * admin_audit_logs. It does not trigger the harness, does not create CARE rides,
 * does not dispatch, does not accept offers, does not price, does not touch
 * wallet and does not enable public CARE.
 */
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const limit = parseBoundedInt(req.query.limit, 50, 1, 100);
    const offset = parseBoundedInt(req.query.offset, 0, 0, 10_000);
    const rideId = normalizeOptionalText(req.query.rideId);
    const driverId = normalizeOptionalText(req.query.driverId);
    const adminId = normalizeOptionalText(req.query.adminId);
    const status = normalizeOptionalText(req.query.status, 100);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`action = ${CARE_ELIGIBILITY_SHADOW_AUDIT_ACTION}`,
      Prisma.sql`entity_type = ${CARE_ELIGIBILITY_SHADOW_AUDIT_ENTITY_TYPE}`,
    ];

    if (rideId) {
      conditions.push(Prisma.sql`entity_id = ${rideId}`);
    }

    if (driverId) {
      conditions.push(Prisma.sql`new_value ->> 'driverId' = ${driverId}`);
    }

    if (adminId) {
      conditions.push(Prisma.sql`admin_id = ${adminId}`);
    }

    if (status) {
      conditions.push(Prisma.sql`new_value ->> 'status' = ${status}`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    const logs = await prisma.$queryRaw<CareShadowAuditLogRow[]>(Prisma.sql`
      SELECT
        id,
        admin_id AS "adminId",
        admin_email AS "adminEmail",
        action,
        entity_type AS "entityType",
        entity_id AS "entityId",
        old_value AS "oldValue",
        new_value AS "newValue",
        reason,
        ip_address AS "ipAddress",
        user_agent AS "userAgent",
        created_at AS "createdAt"
      FROM admin_audit_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const totals = await prisma.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM admin_audit_logs
      ${whereClause}
    `);

    return res.json({
      success: true,
      data: {
        readOnly: true,
        careShadow: true,
        publicCode: CARE_UNAVAILABLE_CODE,
        operationAllowed: false,
        dispatchAllowed: false,
        acceptanceAllowed: false,
        walletAllowed: false,
        filters: {
          rideId,
          driverId,
          adminId,
          status,
        },
        items: logs.map(serializeAuditLog),
        pagination: {
          limit,
          offset,
          total: Number(totals[0]?.total ?? 0),
          showing: logs.length,
        },
      },
    });
  } catch (_err) {
    return res.status(500).json({
      success: false,
      error: 'CARE_SHADOW_AUDIT_READ_FAILED',
    });
  }
});

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
