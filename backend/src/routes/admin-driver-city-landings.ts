import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireRole } from '../middlewares/auth';

const router = Router();

const VALID_STATUSES = ['IMPLANTACAO', 'RECRUTAMENTO', 'OPERACAO', 'PAUSADA'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalize text to URL-safe slug (lowercase, no accents, hyphenated) */
function toSlug(city: string, state: string): string {
  return `${city}-${state}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// All routes require SUPER_ADMIN
router.use(authenticateAdmin, requireRole(['SUPER_ADMIN']));

// GET /api/admin/driver-city-landings — list all
router.get('/', async (_req: Request, res: Response) => {
  try {
    const cities = await prisma.driver_city_landings.findMany({
      orderBy: [{ state: 'asc' }, { city: 'asc' }],
    });

    const result = cities.map((c) => ({
      ...c,
      public_url: `/motorista/cidade/${c.slug}`,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ADMIN_DRIVER_CITY_LANDINGS] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// POST /api/admin/driver-city-landings — create city
router.post('/', async (req: Request, res: Response) => {
  try {
    const { city, state, public_status, landing_enabled, whatsapp_number, slug: customSlug } = req.body;
    const admin = (req as any).admin;

    if (!city || !state) {
      return res.status(400).json({ success: false, error: 'city e state são obrigatórios' });
    }
    if (String(city).trim().length < 2 || String(city).trim().length > 120) {
      return res.status(400).json({ success: false, error: 'city deve ter entre 2 e 120 caracteres' });
    }
    if (String(state).trim().length !== 2) {
      return res.status(400).json({ success: false, error: 'state deve ter exatamente 2 caracteres' });
    }

    const status = public_status || 'IMPLANTACAO';
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: `public_status inválido. Permitidos: ${VALID_STATUSES.join(', ')}` });
    }

    // Generate or validate slug
    const slug = customSlug ? String(customSlug).trim().toLowerCase() : toSlug(city, state);
    if (!SLUG_RE.test(slug) || slug.length > 160) {
      return res.status(400).json({ success: false, error: 'slug inválido (lowercase, URL-safe, sem acentos)' });
    }

    // Check uniqueness
    const existing = await prisma.driver_city_landings.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Slug já existe' });
    }

    if (whatsapp_number && String(whatsapp_number).replace(/\D/g, '').length > 20) {
      return res.status(400).json({ success: false, error: 'whatsapp_number inválido' });
    }

    const created = await prisma.driver_city_landings.create({
      data: {
        city: String(city).trim(),
        state: String(state).trim().toUpperCase(),
        slug,
        public_status: status,
        landing_enabled: landing_enabled === true,
        whatsapp_number: whatsapp_number ? String(whatsapp_number).trim() : null,
        created_by_admin_id: admin?.id || null,
        updated_by_admin_id: admin?.id || null,
      },
    });

    res.status(201).json({
      success: true,
      data: { ...created, public_url: `/motorista/cidade/${created.slug}` },
    });
  } catch (err) {
    console.error('[ADMIN_DRIVER_CITY_LANDINGS] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// PATCH /api/admin/driver-city-landings/:id — update city
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { city, state, public_status, landing_enabled, whatsapp_number } = req.body;
    const admin = (req as any).admin;

    const existing = await prisma.driver_city_landings.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Cidade não encontrada' });
    }

    const data: any = { updated_by_admin_id: admin?.id || null };

    if (city !== undefined) {
      if (String(city).trim().length < 2 || String(city).trim().length > 120) {
        return res.status(400).json({ success: false, error: 'city deve ter entre 2 e 120 caracteres' });
      }
      data.city = String(city).trim();
    }
    if (state !== undefined) {
      if (String(state).trim().length !== 2) {
        return res.status(400).json({ success: false, error: 'state deve ter exatamente 2 caracteres' });
      }
      data.state = String(state).trim().toUpperCase();
    }
    if (public_status !== undefined) {
      if (!VALID_STATUSES.includes(public_status)) {
        return res.status(400).json({ success: false, error: `public_status inválido. Permitidos: ${VALID_STATUSES.join(', ')}` });
      }
      data.public_status = public_status;
    }
    if (landing_enabled !== undefined) {
      data.landing_enabled = landing_enabled === true;
    }
    if (whatsapp_number !== undefined) {
      if (whatsapp_number && String(whatsapp_number).replace(/\D/g, '').length > 20) {
        return res.status(400).json({ success: false, error: 'whatsapp_number inválido' });
      }
      data.whatsapp_number = whatsapp_number ? String(whatsapp_number).trim() : null;
    }

    const updated = await prisma.driver_city_landings.update({
      where: { id },
      data,
    });

    res.json({
      success: true,
      data: { ...updated, public_url: `/motorista/cidade/${updated.slug}` },
    });
  } catch (err) {
    console.error('[ADMIN_DRIVER_CITY_LANDINGS] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export default router;
