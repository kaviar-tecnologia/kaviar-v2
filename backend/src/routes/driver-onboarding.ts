import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { driverRegistrationService } from '../services/driver-registration.service';
import { notifyAdminNewDriver } from '../services/admin-alert.service';

const router = Router();
const prisma = new PrismaClient();

const driverOnboardingSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(10, 'Telefone é obrigatório'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  document_cpf: z.string().min(11, 'CPF deve ter 11 dígitos').max(11, 'CPF deve ter 11 dígitos'),
  vehicle_color: z.string().min(2, 'Cor do veículo é obrigatória'),
  vehicle_model: z.string().nullable().optional(),
  vehicle_plate: z.string().nullable().optional(),
  accepted_terms: z.boolean().refine(val => val === true, {
    message: 'Você deve aceitar os termos de uso'
  }),
  neighborhoodId: z.string().optional(),
  communityId: z.string().optional(),
  lat: z.number({ required_error: 'Localização GPS é obrigatória' }),
  lng: z.number({ required_error: 'Localização GPS é obrigatória' }),
  partner_code: z.string().optional(),
});

// POST /api/driver/onboarding - Cadastro público de motorista (web)
router.post('/onboarding', async (req: Request, res: Response) => {
  try {
    const data = driverOnboardingSchema.parse(req.body);

    // Chamar mesma service do endpoint do app
    const result = await driverRegistrationService.register({
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password,
      document_cpf: data.document_cpf,
      vehicle_color: data.vehicle_color,
      vehicle_model: data.vehicle_model ?? undefined,
      vehicle_plate: data.vehicle_plate ?? undefined,
      accepted_terms: data.accepted_terms,
      neighborhoodId: data.neighborhoodId,
      communityId: data.communityId,
      lat: data.lat,
      lng: data.lng,
      verificationMethod: 'GPS_AUTO',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || undefined
    });

    if (!result.success) {
      // If driver already exists and partner_code was provided, try to create link request
      if (data.partner_code && (result.error === 'Email já cadastrado' || result.error === 'Telefone já cadastrado' || result.error === 'CPF já cadastrado')) {
        try {
          const code = data.partner_code.toUpperCase().trim();
          const partner = await prisma.territorial_partners.findUnique({ where: { referral_code: code } });
          if (partner && partner.status === 'active') {
            // Find the existing driver
            const existingDriver = await prisma.drivers.findFirst({
              where: { OR: [{ email: data.email }, { phone: data.phone }, { document_cpf: data.document_cpf }] },
              select: { id: true },
            });
            if (existingDriver) {
              await prisma.partner_link_requests.upsert({
                where: { partner_id_driver_id: { partner_id: partner.id, driver_id: existingDriver.id } },
                create: { partner_id: partner.id, driver_id: existingDriver.id, source: 'referral_code' },
                update: {},
              });
              console.log(`[PARTNER_LINK_REQUEST] existing driver=${existingDriver.id} partner=${partner.id} code=${code}`);
            }
          }
        } catch (e) {
          console.error('[PARTNER_LINK_REQUEST_EXISTING_FAILED]', e);
        }
      }
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Cadastro realizado com sucesso',
      data: {
        id: result.driver!.id,
        name: result.driver!.name,
        email: result.driver!.email,
        status: result.driver!.status
      },
      token: result.token
    });

    // Process partner_code async (non-blocking, never fails the registration)
    if (data.partner_code && result.driver) {
      try {
        const code = data.partner_code.toUpperCase().trim();
        const partner = await prisma.territorial_partners.findUnique({ where: { referral_code: code } });
        if (partner && partner.status === 'active') {
          await prisma.partner_link_requests.upsert({
            where: { partner_id_driver_id: { partner_id: partner.id, driver_id: result.driver.id } },
            create: { partner_id: partner.id, driver_id: result.driver.id, source: 'referral_code' },
            update: {},
          });
          console.log(`[PARTNER_LINK_REQUEST] driver=${result.driver.id} partner=${partner.id} code=${code}`);
        }
      } catch (e) {
        console.error('[PARTNER_LINK_REQUEST_FAILED]', e);
      }
    }

    // Admin SMS alert (non-blocking)
    if (result.driver) {
      (async () => {
        let territoryId: string | undefined;
        if (result.driver!.neighborhood_id) {
          const n = await prisma.neighborhoods.findUnique({ where: { id: result.driver!.neighborhood_id }, select: { territory_id: true } });
          territoryId = n?.territory_id ?? undefined;
        }
        await notifyAdminNewDriver({
          name: data.name,
          phone: data.phone,
          email: data.email,
          modality: 'CAR',
          region: data.neighborhoodId || undefined,
          territoryId,
        });
      })().catch(() => {});
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: error.errors[0].message
      });
    }
    console.error('Error in driver onboarding:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao realizar cadastro'
    });
  }
});

export default router;
