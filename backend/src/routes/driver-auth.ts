import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import { driverRegistrationService } from '../services/driver-registration.service';
import { notifyAdminNewDriver } from '../services/admin-alert.service';
import { loginByEmailRateLimit } from '../middlewares/auth-rate-limit';

const router = Router();

const driverLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

const driverRegisterSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  document_cpf: z.string().min(11, 'CPF deve ter 11 dígitos').max(11, 'CPF deve ter 11 dígitos'),
  accepted_terms: z.boolean().refine(val => val === true, {
    message: 'Você deve aceitar os termos de uso'
  }),
  vehicle_color: z.string().min(2, 'Cor do veículo é obrigatória'),
  vehicle_model: z.string().nullable().optional(),
  vehicle_plate: z.string().nullable().optional(),
  neighborhoodId: z.string().optional(),
  neighborhoodName: z.string().optional(),
  communityId: z.string().optional(),
  lat: z.number({ required_error: 'Localização GPS é obrigatória' }),
  lng: z.number({ required_error: 'Localização GPS é obrigatória' }),
  verificationMethod: z.enum(['GPS_AUTO', 'MANUAL_SELECTION']).optional()
});

// POST /api/auth/driver/register - Cadastro público (sem token)
router.post('/driver/register', async (req, res) => {
  try {
    const data = driverRegisterSchema.parse(req.body);

    // Chamar service única
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
      neighborhoodName: data.neighborhoodName,
      communityId: data.communityId,
      lat: data.lat,
      lng: data.lng,
      verificationMethod: data.verificationMethod || 'GPS_AUTO',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || undefined
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.status(201).json({
      success: true,
      token: result.token,
      user: {
        id: result.driver!.id,
        name: result.driver!.name,
        email: result.driver!.email,
        phone: result.driver!.phone,
        status: result.driver!.status,
        user_type: 'DRIVER',
        isPending: result.driver!.isPending
      }
    });

    // Auto-create referral if referral_code provided (non-blocking)
    try {
      const referralCode = req.body.referral_code?.toUpperCase();
      if (referralCode && result.driver?.phone) {
        const agent = await prisma.referral_agents.findFirst({
          where: { referral_code: referralCode, is_active: true },
        });
        if (agent) {
          const existing = await prisma.referrals.findFirst({
            where: { OR: [{ driver_phone: result.driver.phone }, { driver_id: result.driver.id }] },
          });
          if (!existing) {
            const source = req.body.referral_source === 'link' ? 'link' : 'manual_code';
            await prisma.referrals.create({
              data: { agent_id: agent.id, driver_phone: result.driver.phone, driver_id: result.driver.id, source },
            });
            console.log(`[REFERRAL_AUTO] code=${referralCode} agent=${agent.id} driver=${result.driver.id} source=${source}`);
          }
        }
      }
    } catch (refErr) {
      console.error('[REFERRAL_AUTO_ERROR] Non-blocking:', refErr);
    }

    // Admin SMS alert (non-blocking)
    (async () => {
      let territoryId: string | undefined;
      if (result.driver?.neighborhood_id) {
        const n = await prisma.neighborhoods.findUnique({ where: { id: result.driver.neighborhood_id }, select: { territory_id: true, name: true } });
        territoryId = n?.territory_id ?? undefined;
      }
      await notifyAdminNewDriver({
        name: data.name,
        phone: data.phone,
        email: data.email,
        modality: 'CAR',
        region: data.neighborhoodName || undefined,
        territoryId,
      });
    })().catch(() => {});
  } catch (error) {
    console.error('Error in driver register:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: error.errors[0].message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erro ao cadastrar motorista'
    });
  }
});

router.post('/driver/login', loginByEmailRateLimit, async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Configuração inválida' });
    }

    const { email, password } = driverLoginSchema.parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();

    const driver = await prisma.drivers.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });

    if (!driver || !driver.password_hash) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isValid = await bcrypt.compare(password, driver.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Apenas bloqueia rejected/suspended
    if (['rejected', 'suspended'].includes(driver.status)) {
      return res.status(403).json({ error: 'Conta suspensa ou rejeitada' });
    }

    // Generate unique session ID (single-device control)
    const sessionId = randomUUID();
    const { device_id, device_model } = req.body || {};
    await prisma.drivers.update({
      where: { id: driver.id },
      data: {
        active_session_id: sessionId,
        ...(device_id && { device_id }),
        ...(device_model && { device_model }),
      },
    });

    const token = jwt.sign(
      { 
        userId: driver.id, 
        userType: 'DRIVER', 
        email: driver.email,
        status: driver.status,
        sessionId
      },
      process.env.JWT_SECRET,
      { expiresIn: '72h' }
    );

    res.json({
      token,
      user: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        status: driver.status,
        user_type: 'DRIVER',
        phone_verified_at: driver.phone_verified_at,
        isPending: driver.status === 'pending' // ✅ Flag para frontend
      }
    });
  } catch (error) {
    console.error('[LOGIN] Erro:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(400).json({ error: 'Erro no login' });
  }
});

// TOMBSTONE: endpoint inseguro desativado — use POST /api/auth/forgot-password + /api/auth/reset-password
router.post('/driver/set-password', (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Este endpoint foi desativado por segurança. Use a recuperação de senha por email ou atualize o app.'
  });
});

// POST /api/auth/driver/location - Envio de localização (autenticado)
router.post('/driver/location', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token ausente' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    if (decoded.userType !== 'DRIVER') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }

    // Atualizar última localização do motorista
    await prisma.drivers.update({
      where: { id: decoded.userId },
      data: {
        last_lat: lat,
        last_lng: lng,
        last_location_updated_at: new Date()
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Erro ao atualizar localização' });
  }
});

export { router as driverAuthRoutes };
