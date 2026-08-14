import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { dispatcherService } from '../services/dispatcher.service';
import { acceptOfferInternal } from '../services/offer-acceptance.service';
import { getCreditBalance } from '../services/credit.service';
import { getDriverFinancialSummary } from '../services/financial-summary.service';
import { Decimal } from '@prisma/client/runtime/library';
import { authenticateDriver } from '../middlewares/auth';
import { createHash } from 'crypto';
import { canDriverOperateInMunicipality, mapServiceCategoryToMunicipalModality } from '../services/municipal-regulation.service';
import { resolveTerritory } from '../services/territory-resolver.service';
import { config } from '../config';

const router = Router();

function tokenHash(token?: string | null): string {
  if (!token) return 'none';
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

async function resolveMunicipalityForDriver(driverId: string) {
  const driver = await prisma.drivers.findUnique({
    where: { id: driverId },
    select: {
      vehicle_type: true,
      neighborhoods: {
        select: {
          city: true,
          territory: {
            select: { uf: true },
          },
        },
      },
      driver_location: {
        select: {
          lat: true,
          lng: true,
          updated_at: true,
        },
      },
    },
  });

  let city = driver?.neighborhoods?.city || null;
  let state = driver?.neighborhoods?.territory?.uf || null;
  let resolutionSource: 'driver_neighborhood' | 'driver_last_location' | 'unresolved' = 'unresolved';

  if (city && state) {
    resolutionSource = 'driver_neighborhood';
  } else if (driver?.driver_location) {
    const lat = Number(driver.driver_location.lat);
    const lng = Number(driver.driver_location.lng);

    const territory = await resolveTerritory(lng, lat);
    if (territory?.neighborhood?.id) {
      const neighborhood = await prisma.neighborhoods.findUnique({
        where: { id: territory.neighborhood.id },
        select: {
          city: true,
          territory: {
            select: { uf: true },
          },
        },
      });

      if (neighborhood?.city && neighborhood?.territory?.uf) {
        city = neighborhood.city;
        state = neighborhood.territory.uf;
        resolutionSource = 'driver_last_location';
      }
    }
  }

  return {
    vehicleType: driver?.vehicle_type || null,
    city,
    state,
    resolutionSource,
  };
}

// 5.3 Driver online/offline
router.post('/me/availability', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const { availability } = req.body;

    if (!['offline', 'online', 'busy'].includes(availability)) {
      return res.status(400).json({ error: 'Status de disponibilidade inválido' });
    }

    if (availability === 'online') {
      const driver = await prisma.drivers.findUnique({
        where: { id: driverId },
        select: { status: true },
      });

      if (!driver) {
        return res.status(404).json({
          success: false,
          error: 'DRIVER_NOT_FOUND',
          message: 'Motorista não encontrado.',
        });
      }

      const normalizedDriverStatus = String(driver.status || '').toLowerCase();
      if (!['approved', 'active'].includes(normalizedDriverStatus)) {
        return res.status(403).json({
          success: false,
          error: 'DRIVER_NOT_APPROVED',
          message: 'Seu cadastro ainda precisa ser aprovado pela KAVIAR antes de ficar online.',
        });
      }
    }

    if (availability === 'online' && config.driverEnforcement.municipalRegulatoryGateEnabled) {
      const resolvedMunicipality = await resolveMunicipalityForDriver(driverId);
      const city = resolvedMunicipality.city;
      const state = resolvedMunicipality.state;
      const modality = mapServiceCategoryToMunicipalModality(
        resolvedMunicipality.vehicleType === 'MOTORCYCLE' ? 'MOTO_PASSENGER' : 'CAR_NORMAL',
      );

      if (!city || !state) {
        console.warn('[MUNICIPAL_LOCATION_REQUIRED]', {
          driverId,
          resolutionSource: resolvedMunicipality.resolutionSource,
        });

        return res.status(403).json({
          success: false,
          error: 'MUNICIPAL_LOCATION_REQUIRED',
          message: 'Não foi possível confirmar sua cidade para validar a autorização municipal. Atualize sua localização ou procure o suporte KAVIAR.',
        });
      }

      const operationGate = await canDriverOperateInMunicipality(driverId, city, state, modality);
      if (!operationGate.allowed) {
        return res.status(403).json({
          success: false,
          error: 'MUNICIPAL_AUTH_REQUIRED',
          message: operationGate.reason || 'Regularização municipal pendente para operar nesta cidade.',
          city,
          state,
          modality,
          municipal: operationGate.municipal || null,
        });
      }
    }

    await prisma.driver_status.upsert({
      where: { driver_id: driverId },
      create: {
        driver_id: driverId,
        availability
      },
      update: {
        availability
      }
    });

    console.log(`[DRIVER_AVAILABILITY] driver_id=${driverId} availability=${availability}`);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[DRIVER_AVAILABILITY_ERROR]', error);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// 5.4 Driver envia localização
router.post('/me/location', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const { lat, lng, heading, speed } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Localização inválida' });
    }

    await prisma.driver_locations.upsert({
      where: { driver_id: driverId },
      create: {
        driver_id: driverId,
        lat: new Decimal(lat),
        lng: new Decimal(lng),
        heading: heading ? new Decimal(heading) : null,
        speed: speed ? new Decimal(speed) : null
      },
      update: {
        lat: new Decimal(lat),
        lng: new Decimal(lng),
        heading: heading ? new Decimal(heading) : null,
        speed: speed ? new Decimal(speed) : null
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[DRIVER_LOCATION_ERROR]', error);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// 5.4.1 Driver push token
router.put('/me/push-token', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const { token, fcmToken } = req.body;
    const platform = typeof req.body?.platform === 'string' ? req.body.platform : 'unknown';
    if (!token || typeof token !== 'string') {
      console.info('[driver_push_token_update]', {
        driverId,
        hasToken: false,
        tokenHash: 'none',
        platform,
        success: false,
        error: 'invalid_token',
      });
      return res.status(400).json({ error: 'Token inválido' });
    }
    const data: any = { expo_push_token: token, push_token_updated_at: new Date() };
    if (fcmToken && typeof fcmToken === 'string') {
      data.fcm_push_token = fcmToken;
    }
    await prisma.drivers.update({
      where: { id: driverId },
      data
    });
    console.info('[driver_push_token_update]', {
      driverId,
      hasToken: true,
      tokenHash: tokenHash(token),
      platform,
      success: true,
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('[driver_push_token_update]', {
      driverId: (req as any).driverId,
      hasToken: Boolean(req.body?.token),
      tokenHash: tokenHash(typeof req.body?.token === 'string' ? req.body.token : null),
      platform: typeof req.body?.platform === 'string' ? req.body.platform : 'unknown',
      success: false,
      error: error?.message || 'unknown_error',
    });
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// 5.5 Driver aceita oferta
router.post('/offers/:offer_id/accept', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const { offer_id } = req.params;
    const { adjustment } = req.body;

    // Validate adjustment if provided
    if (adjustment !== undefined && adjustment !== null) {
      if (![5, 8, 10].includes(Number(adjustment))) {
        return res.status(400).json({ error: 'Ajuste inválido. Valores permitidos: 5, 8, 10' });
      }
    }

    const result = await acceptOfferInternal(offer_id, driverId, adjustment ? Number(adjustment) : undefined);

    res.json({ success: true, data: { ride_id: result.id, adjustment_status: result.adjustment_status || null } });
  } catch (error: any) {
    console.error('[OFFER_ACCEPT_ERROR]', error);
    
    if (error.message === 'Offer not found') {
      return res.status(404).json({ error: 'Oferta não encontrada' });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (error.message === 'Offer not pending' || error.message === 'Offer expired') {
      return res.status(400).json({ error: 'Oferta já expirou ou foi respondida' });
    }
    if (error.message === 'Offer acceptance conflict' || error.message === 'Ride not available') {
      return res.status(409).json({ error: 'Outra oferta já aceitou esta corrida' });
    }
    if (error.message === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({ error: 'Saldo insuficiente. Recarregue sua carteira.' });
    }
    
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// 5.6 Driver rejeita oferta
router.post('/offers/:offer_id/reject', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const { offer_id } = req.params;

    const offer = await prisma.ride_offers.findUnique({
      where: { id: offer_id }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Oferta não encontrada' });
    }

    if (offer.driver_id !== driverId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (offer.status !== 'pending') {
      return res.status(400).json({ error: 'Oferta já expirou ou foi respondida' });
    }

    await prisma.ride_offers.update({
      where: { id: offer_id },
      data: {
        status: 'rejected',
        responded_at: new Date()
      }
    });

    console.log(`[OFFER_REJECTED] offer_id=${offer_id} ride_id=${offer.ride_id} driver_id=${driverId}`);

    // Redispatch (async)
    setImmediate(async () => {
      await prisma.rides_v2.update({
        where: { id: offer.ride_id },
        data: { status: 'requested' }
      });
      await dispatcherService.dispatchRide(offer.ride_id);
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[OFFER_REJECT_ERROR]', error);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// GET /api/v2/drivers/me/offers — ofertas pendentes para o motorista
router.get('/me/offers', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;

    const offers = await prisma.ride_offers.findMany({
      where: { driver_id: driverId, status: 'pending' },
      orderBy: { sent_at: 'desc' },
      include: {
        ride: {
          select: {
            id: true, status: true, ride_type: true,
            origin_lat: true, origin_lng: true, origin_text: true,
            dest_lat: true, dest_lng: true, destination_text: true,
            is_homebound: true, quoted_price: true, trip_details: true,
            requested_at: true, wait_requested: true, wait_estimated_min: true,
            passenger: { select: { name: true } }
          }
        }
      }
    });

    res.json({ success: true, data: offers });
  } catch (error: any) {
    console.error('[DRIVER_OFFERS_ERROR]', error);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// GET /api/v2/drivers/me/current-ride — corrida ativa do motorista

// GET /api/v2/drivers/me/credits — saldo de créditos do motorista
router.get('/me/credits', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const balance = await getCreditBalance(driverId);
    res.json({ success: true, data: { balance } });
  } catch (error: any) {
    console.error('[DRIVER_CREDITS_ERROR]', error);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// GET /api/v2/drivers/me/financial-summary
router.get('/me/financial-summary', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const period = (req.query.period as string) || '30d';
    const data = await getDriverFinancialSummary(driverId, period);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[DRIVER_FINANCIAL_SUMMARY_ERROR]', error);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

router.get('/me/current-ride', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;

    const ride = await prisma.rides_v2.findFirst({
      where: {
        driver_id: driverId,
        status: { in: ['accepted', 'arrived', 'in_progress', 'pending_adjustment'] }
      },
      orderBy: { updated_at: 'desc' },
      include: {
        passenger: { select: { name: true, last_lat: true, last_lng: true, last_location_updated_at: true } }
      }
    });

    const locFresh = ride?.passenger?.last_location_updated_at && (Date.now() - new Date(ride.passenger.last_location_updated_at).getTime()) < 30000;
    res.json({ success: true, data: ride ? {
      ...ride,
      boarding_code: undefined,
      origin_lat: Number(ride.origin_lat),
      origin_lng: Number(ride.origin_lng),
      dest_lat: Number(ride.dest_lat),
      dest_lng: Number(ride.dest_lng),
      passenger: { ...ride.passenger, last_lat: locFresh ? ride.passenger?.last_lat : null, last_lng: locFresh ? ride.passenger?.last_lng : null, last_location_updated_at: undefined },
    } : null });
  } catch (error: any) {
    console.error('[DRIVER_CURRENT_RIDE_ERROR]', error);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// ── Excellence Seal: driver queries own seal ──────────────────────────────────
router.get('/me/excellence-seal', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    if (!driverId) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const badge = await prisma.driver_badges.findUnique({
      where: { driver_id_badge_code: { driver_id: driverId, badge_code: 'EXCELLENCE_SEAL' } },
      select: { progress: true, unlocked_at: true },
    });

    return res.json({
      success: true,
      data: {
        active: badge ? badge.progress === 100 : false,
        grantedAt: badge?.unlocked_at ?? null,
      },
    });
  } catch (error) {
    console.error('[DRIVER_SEAL_QUERY]', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar selo.' });
  }
});

export default router;
