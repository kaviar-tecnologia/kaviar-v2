import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  authenticateAdmin,
  requireSuperAdmin,
} from '../middlewares/auth';
import {
  activatePrevilemosInsurance,
  cancelPrevilemosInsurance,
  DriverInsuranceError,
  listPrevilemosInsurance,
} from '../services/driver-insurance.service';
import { PrevilemosError } from '../services/previlemos-service';
import { audit, auditCtx } from '../utils/audit';
import {
  CareAdminConflict, lockCareAdminRow, writeCareAdminAuditTx,
} from '../services/care/care-admin-atomic';

const router = Router();

const activateSchema = z.object({
  dataInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  numPassageiro: z.number().int().positive().optional(),

  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  endereco: z.object({
    Logradouro: z.string().min(1),
    Numero: z.string().min(1),
    Complemento: z.string().optional(),
    Bairro: z.string().min(1),
    Cidade: z.string().min(1),
    Uf: z.string().length(2),
    Cep: z.string().min(8),
  }),

  veiculo: z.object({
    Marca: z.string().min(1),
    Modelo: z.string().min(1).optional(),
    AnoFabricacao: z.number().int().min(1900).max(2100),
    AnoModelo: z.number().int().min(1900).max(2100),
    Chassi: z.string().optional(),
    Renavam: z.string().optional(),
    Proprietario: z.string().optional(),
    CpfCnpjProprietario: z.string().optional(),
  }),
});

const cancelSchema = z.object({
  dataCancelamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const coverageLinkSchema = z.object({
  coverage_id: z.string().uuid().nullable(),
});

const CARE_INSURANCE_MODALITIES = new Set([
  'CARE_ASSISTED',
  'CARE_FOLDING_WHEELCHAIR',
  'CARE_ADAPTED_WHEELCHAIR',
]);

const normalizePlate = (value: string | null | undefined) =>
  typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';

function publicEnrollment(enrollment: any) {
  return {
    id: enrollment.id,
    provider: enrollment.provider,
    status: enrollment.status,
    vehiclePlate: enrollment.vehicle_plate,
    validFrom: enrollment.valid_from,
    validUntil: enrollment.valid_until,
    cancelledAt: enrollment.cancelled_at,
    providerReference: enrollment.provider_reference,
    operationalCoverageId: enrollment.operational_coverage_id,
    operationalCoverageLinkedAt: enrollment.operational_coverage_linked_at,
    operationalCoverageLinkedByAdminId: enrollment.operational_coverage_linked_by_admin_id,
    providerResponse: enrollment.provider_response,
    lastErrorCode: enrollment.last_error_code,
    lastErrorMessage: enrollment.last_error_message,
    attemptCount: enrollment.attempt_count,
    lastAttemptAt: enrollment.last_attempt_at,
    createdAt: enrollment.created_at,
    updatedAt: enrollment.updated_at,
  };
}

function handleError(res: any, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_INPUT',
      message: error.errors[0]?.message || 'Dados inválidos.',
    });
  }

  if (error instanceof DriverInsuranceError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.code,
      message: error.message,
    });
  }

  if (error instanceof PrevilemosError) {
    return res.status(
      error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 502
    ).json({
      success: false,
      error: 'PREVILEMOS_ERROR',
      message: error.safeMessage,
    });
  }

  console.error('[DRIVER_INSURANCE_ERROR]', {
    type: error instanceof Error ? error.name : typeof error,
  });

  return res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'Falha ao processar seguro do motorista.',
  });
}

// POST /api/admin/drivers/:id/insurance/previlemos/activate
router.post(
  '/drivers/:id/insurance/previlemos/activate',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const body = activateSchema.parse(req.body);

      const result = await activatePrevilemosInsurance(
        req.params.id,
        body
      );

      if (!result.idempotent) {
        const ctx = auditCtx(req);
        void audit({
          adminId: ctx.adminId,
          adminEmail: ctx.adminEmail,
          action: 'activate_driver_insurance',
          entityType: 'driver_insurance_enrollment',
          entityId: result.enrollment.id,
          newValue: {
            driverId: req.params.id,
            provider: 'PREVILEMOS',
            status: result.enrollment.status,
            providerReference:
              result.enrollment.provider_reference,
          },
          ipAddress: ctx.ip,
          userAgent: ctx.ua,
        });
      }

      return res.status(result.idempotent ? 200 : 201).json({
        success: true,
        idempotent: result.idempotent,
        data: publicEnrollment(result.enrollment),
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// GET /api/admin/drivers/:id/insurance/previlemos
router.get(
  '/drivers/:id/insurance/previlemos',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const rows = await listPrevilemosInsurance(req.params.id);

      return res.json({
        success: true,
        data: rows.map(publicEnrollment),
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// POST /api/admin/drivers/:id/insurance/previlemos/:insuranceId/operational-coverage
router.post(
  '/drivers/:id/insurance/previlemos/:insuranceId/operational-coverage',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const body = coverageLinkSchema.parse(req.body);
      // The driver lock serializes competing link requests for the same driver.
      // Enrollment and coverage row locks ensure provider cancellation/review
      // cannot change a read before its linked write is committed.
      const updated = await prisma.$transaction(async (tx) => {
        await lockCareAdminRow(tx, 'driver', req.params.id);
        await lockCareAdminRow(tx, 'enrollment', req.params.insuranceId);
        const [enrollment, driver] = await Promise.all([
          tx.driver_insurance_enrollments.findFirst({
            where: { id: req.params.insuranceId, driver_id: req.params.id },
          }),
          tx.drivers.findUnique({
            where: { id: req.params.id },
            select: { vehicle_plate: true, neighborhood_id: true },
          }),
        ]);
        if (!enrollment || !driver) throw new CareAdminConflict('INSURANCE_ENROLLMENT_CHANGED');

        if (body.coverage_id) {
          // Unlinking must remain possible after expiry/revocation/plate change.
          // Positive linking has stronger requirements, re-read under locks.
          if (!driver.vehicle_plate ||
              normalizePlate(driver.vehicle_plate) !== normalizePlate(enrollment.vehicle_plate)) {
            throw new CareAdminConflict('INSURANCE_ENROLLMENT_VEHICLE_MISMATCH');
          }
          if (!driver.neighborhood_id) {
            throw new CareAdminConflict('CARE_DRIVER_TERRITORY_UNVERIFIED');
          }
          await lockCareAdminRow(tx, 'neighborhood', driver.neighborhood_id);
          const driverHome = await tx.neighborhoods.findUnique({
            where: { id: driver.neighborhood_id },
            select: {
              is_active: true, is_verified: true, verified_at: true,
              verified_by: true, territory_id: true,
            },
          });
          await lockCareAdminRow(tx, 'coverage', body.coverage_id);
          const coverage = await tx.operational_insurance_coverages.findUnique({
            where: { id: body.coverage_id },
          });
          const now = new Date();
          const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          if (!coverage || !CARE_INSURANCE_MODALITIES.has(String(coverage.modality)) ||
              coverage.status !== 'ACTIVE' || coverage.coverage_type !== 'APP' ||
              coverage.care_scope_verified !== true || !coverage.territory_id ||
              !coverage.document_url?.trim() || !coverage.policy_number?.trim() ||
              !coverage.provider_name?.trim() || !coverage.care_scope_verified_by_admin_id?.trim() ||
              !coverage.care_scope_verified_at || coverage.care_scope_verified_at > now ||
              coverage.valid_from > today || coverage.valid_until < today) {
            throw new CareAdminConflict('CARE_OPERATIONAL_COVERAGE_NOT_VERIFIED');
          }
          if (!driverHome || driverHome.is_active !== true || driverHome.is_verified !== true ||
              !driverHome.verified_by?.trim() || !driverHome.verified_at ||
              driverHome.verified_at > now || driverHome.territory_id !== coverage.territory_id) {
            throw new CareAdminConflict('CARE_DRIVER_TERRITORY_UNVERIFIED');
          }
          if (enrollment.status !== 'ACTIVE' || enrollment.cancelled_at ||
              !enrollment.provider_reference?.trim() ||
              enrollment.valid_from > today || enrollment.valid_until < today) {
            throw new CareAdminConflict('DRIVER_INSURANCE_ENROLLMENT_NOT_ACTIVE');
          }
          if (enrollment.valid_from < coverage.valid_from ||
              enrollment.valid_until > coverage.valid_until) {
            throw new CareAdminConflict('DRIVER_INSURANCE_OUTSIDE_OPERATIONAL_COVERAGE_WINDOW');
          }
          if (coverage.policy_number.trim().toUpperCase() !==
              enrollment.provider_reference.trim().toUpperCase()) {
            throw new CareAdminConflict('CARE_POLICY_REFERENCE_MISMATCH');
          }
          // A second active linked certificate for the same driver, plate,
          // mode and territory would make the runtime evidence ambiguous.
          const otherLinks = await tx.driver_insurance_enrollments.findMany({
            where: {
              driver_id: req.params.id,
              id: { not: enrollment.id },
              status: 'ACTIVE',
              cancelled_at: null,
              valid_from: { lte: today },
              valid_until: { gte: today },
              operational_coverage_id: { not: null },
              operational_coverage: {
                is: {
                  territory_id: coverage.territory_id,
                  modality: coverage.modality,
                  coverage_type: 'APP',
                  status: 'ACTIVE',
                  care_scope_verified: true,
                  valid_from: { lte: today },
                  valid_until: { gte: today },
                },
              },
            },
            select: { vehicle_plate: true },
          });
          if (otherLinks.some((link) =>
            normalizePlate(link.vehicle_plate) === normalizePlate(driver.vehicle_plate))) {
            throw new CareAdminConflict('CARE_DRIVER_ENROLLMENT_AMBIGUOUS');
          }
        }

        const admin = (req as any).admin;
        const result = await tx.driver_insurance_enrollments.update({
          where: { id: enrollment.id },
          data: body.coverage_id
            ? {
                operational_coverage_id: body.coverage_id,
                operational_coverage_linked_at: new Date(),
                operational_coverage_linked_by_admin_id: admin.id,
              }
            : {
                operational_coverage_id: null,
                operational_coverage_linked_at: null,
                operational_coverage_linked_by_admin_id: null,
              },
        });
        const ctx = auditCtx(req);
        await writeCareAdminAuditTx(tx, {
          adminId: ctx.adminId,
          action: body.coverage_id ? 'link_driver_care_insurance_coverage' : 'unlink_driver_care_insurance_coverage',
          entityType: 'driver_insurance_enrollment',
          entityId: enrollment.id,
          oldValue: { coverageId: enrollment.operational_coverage_id ?? null },
          newValue: { coverageId: result.operational_coverage_id ?? null },
          ipAddress: ctx.ip, userAgent: ctx.ua,
        });
        return result;
      });

      return res.json({ success: true, data: publicEnrollment(updated) });
    } catch (error) {
      if (error instanceof CareAdminConflict) {
        return res.status(409).json({ success: false, error: error.code });
      }
      return handleError(res, error);
    }
  }
);

// POST /api/admin/drivers/:id/insurance/previlemos/:insuranceId/cancel
router.post(
  '/drivers/:id/insurance/previlemos/:insuranceId/cancel',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const body = cancelSchema.parse(req.body);

      const result = await cancelPrevilemosInsurance(
        req.params.id,
        req.params.insuranceId,
        body.dataCancelamento
      );

      if (!result.idempotent) {
        const ctx = auditCtx(req);
        void audit({
          adminId: ctx.adminId,
          adminEmail: ctx.adminEmail,
          action: 'cancel_driver_insurance',
          entityType: 'driver_insurance_enrollment',
          entityId: result.enrollment.id,
          newValue: {
            driverId: req.params.id,
            provider: 'PREVILEMOS',
            status: result.enrollment.status,
            providerReference:
              result.enrollment.provider_reference,
          },
          ipAddress: ctx.ip,
          userAgent: ctx.ua,
        });
      }

      return res.json({
        success: true,
        idempotent: result.idempotent,
        data: publicEnrollment(result.enrollment),
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

export default router;
