import { Router } from 'express';
import { z } from 'zod';
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

const router = Router();

router.use(authenticateAdmin);
router.use(requireSuperAdmin);

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
  async (req, res) => {
    try {
      const body = activateSchema.parse(req.body);

      const result = await activatePrevilemosInsurance(
        req.params.id,
        body
      );

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

// POST /api/admin/drivers/:id/insurance/previlemos/:insuranceId/cancel
router.post(
  '/drivers/:id/insurance/previlemos/:insuranceId/cancel',
  async (req, res) => {
    try {
      const body = cancelSchema.parse(req.body);

      const result = await cancelPrevilemosInsurance(
        req.params.id,
        req.params.insuranceId,
        body.dataCancelamento
      );

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
