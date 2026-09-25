import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const PLACES_KEY = process.env.GOOGLE_PLACES_KEY;

if (!PLACES_KEY) console.warn('[GEO_PROXY] GOOGLE_PLACES_KEY not set — geo proxy disabled');

router.use(requireAuth);

// GET /api/geo/reverse?lat=X&lng=Y
router.get('/reverse', async (req: Request, res: Response) => {
  if (!PLACES_KEY) return res.status(503).json({ error: 'Geo service unavailable' });
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${PLACES_KEY}&language=pt-BR`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(502).json({ error: 'Geocoding failed' });
  }
});

// GET /api/geo-proxy/geocode?address=X
router.get('/geocode', async (req: Request, res: Response) => {
  if (!PLACES_KEY) return res.status(503).json({ success: false, error: 'Geo service unavailable' });

  const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
  if (address.length < 5) {
    return res.status(400).json({ success: false, error: 'Endereço é obrigatório' });
  }
  if (address.length > 500) {
    return res.status(400).json({ success: false, error: 'Endereço excede 500 caracteres' });
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${PLACES_KEY}&language=pt-BR&region=br`;
    const upstream = await fetch(url);
    const data: any = await upstream.json();

    if (!upstream.ok) {
      return res.status(502).json({ success: false, error: 'Falha ao consultar serviço de geocodificação' });
    }

    if (data?.status === 'ZERO_RESULTS') {
      return res.status(404).json({ success: false, error: 'Endereço não encontrado' });
    }

    const first = data?.results?.[0];
    const latitude = Number(first?.geometry?.location?.lat);
    const longitude = Number(first?.geometry?.location?.lng);

    if (data?.status !== 'OK' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(502).json({ success: false, error: 'Resposta inválida do serviço de geocodificação' });
    }

    return res.json({
      success: true,
      data: {
        latitude,
        longitude,
        formatted_address: first?.formatted_address || address,
        place_id: first?.place_id || null,
      },
    });
  } catch {
    return res.status(502).json({ success: false, error: 'Geocoding failed' });
  }
});

// GET /api/geo/autocomplete?input=X&lat=Y&lng=Z
router.get('/autocomplete', async (req: Request, res: Response) => {
  if (!PLACES_KEY) return res.status(503).json({ error: 'Geo service unavailable' });
  const { input, lat, lng } = req.query;
  if (!input) return res.status(400).json({ error: 'input required' });
  try {
    const loc = lat && lng ? `&location=${lat},${lng}&radius=30000` : '';
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(String(input))}&key=${PLACES_KEY}&components=country:br&language=pt-BR${loc}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(502).json({ error: 'Autocomplete failed' });
  }
});

// GET /api/geo/place-details?place_id=X
router.get('/place-details', async (req: Request, res: Response) => {
  if (!PLACES_KEY) return res.status(503).json({ error: 'Geo service unavailable' });
  const { place_id } = req.query;
  if (!place_id) return res.status(400).json({ error: 'place_id required' });
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=geometry&key=${PLACES_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(502).json({ error: 'Place details failed' });
  }
});

export default router;
