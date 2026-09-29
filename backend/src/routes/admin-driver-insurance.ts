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
      const [enrollment, driver] = await Promise.all([
        prisma.driver_insurance_enrollments.findFirst({
          where: { id: req.params.insuranceId, driver_id: req.params.id },
        }),
        prisma.drivers.findUnique({
          where: { id: req.params.id },
          select: { vehicle_plate: true },
        }),
      ]);

      if (!enrollment) {
        return res.status(404).json({ success: false, error: 'INSURANCE_ENROLLMENT_NOT_FOUND' });
      }
      if (!driver || normalizePlate(driver.vehicle_plate) !== normalizePlate(enrollment.vehicle_plate)) {
        return res.status(409).json({
          success: false,
          error: 'INSURANCE_ENROLLMENT_VEHICLE_MISMATCH',
          message: 'A placa atual do motorista não corresponde ao vínculo securitário.',
        });
      }

      let coverage: any = null;
      if (body.coverage_id) {
        coverage = await prisma.operational_insurance_coverages.findUnique({
          where: { id: body.coverage_id },
        });
        if (!coverage) {
          return res.status(404).json({ success: false, error: 'OPERATIONAL_COVERAGE_NOT_FOUND' });
        }
        if (!CARE_INSURANCE_MODALITIES.has(String(coverage.modality)) ||
            coverage.status !== 'ACTIVE' ||
            coverage.care_scope_verified !== true ||
            !coverage.territory_id ||
            !coverage.document_url?.trim()) {
          return res.status(409).json({
            success: false,
            error: 'CARE_OPERATIONAL_COVERAGE_NOT_VERIFIED',
          });
        }
        if (enrollment.status !== 'ACTIVE' || enrollment.cancelled_at ||
            !enrollment.provider_reference?.trim()) {
          return res.status(409).json({
            success: false,
            error: 'DRIVER_INSURANCE_ENROLLMENT_NOT_ACTIVE',
          });
        }
        if (enrollment.valid_from < coverage.valid_from ||
            enrollment.valid_until > coverage.valid_until) {
          return res.status(409).json({
            success: false,
            error: 'DRIVER_INSURANCE_OUTSIDE_OPERATIONAL_COVERAGE_WINDOW',
          });
        }
      }

      const admin = (req as any).admin;
      const updated = await prisma.driver_insurance_enrollments.update({
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
      void audit({
        adminId: ctx.adminId,
        adminEmail: ctx.adminEmail,
        action: body.coverage_id ? 'link_driver_care_insurance_coverage' : 'unlink_driver_care_insurance_coverage',
        entityType: 'driver_insurance_enrollment',
        entityId: enrollment.id,
        oldValue: { operationalCoverageId: enrollment.operational_coverage_id || null },
        newValue: { operationalCoverageId: updated.operational_coverage_id || null },
        ipAddress: ctx.ip,
        userAgent: ctx.ua,
      });

      return res.json({ success: true, data: publicEnrollment(updated) });
    } catch (error) {
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
