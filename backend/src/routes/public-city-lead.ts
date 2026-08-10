import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Allowed values — validated server-side
const ALLOWED_CITY_SLUGS = ['santa-cruz-das-palmeiras-sp'];
const ALLOWED_MODALITIES = ['CAR', 'MOTO'];
const ALLOWED_EAR = ['YES', 'NO'];
const MAX_NAME_LEN = 120;
const MAX_UTM_LEN = 100;
const MAX_NOTES_LEN = 500;

// POST /api/public/city-lead — lead público de landing localizada (sem referral code)
router.post('/city-lead', async (req: Request, res: Response) => {
  try {
    const { name, phone, email, city_slug, modality, ear, utm_source, utm_medium, utm_campaign } = req.body;

    if (!name || !phone || !city_slug) {
      return res.status(400).json({ success: false, error: 'Nome, telefone e cidade são obrigatórios' });
    }
    const trimmedName = String(name).trim().slice(0, MAX_NAME_LEN);
    if (trimmedName.length < 2) {
      return res.status(400).json({ success: false, error: 'Nome deve ter pelo menos 2 caracteres' });
    }
    const digits = String(phone).replace(/\D/g, '').slice(0, 15);
    if (digits.length < 10) {
      return res.status(400).json({ success: false, error: 'Telefone deve ter pelo menos 10 dígitos' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).slice(0, 254))) {
      return res.status(400).json({ success: false, error: 'Email inválido' });
    }

    // Validate city_slug against allowed list
    const slug = String(city_slug).toLowerCase().trim();
    if (!ALLOWED_CITY_SLUGS.includes(slug)) {
      return res.status(400).json({ success: false, error: 'Cidade não disponível' });
    }

    // Validate modality
    const mod = modality ? String(modality).toUpperCase().trim() : null;
    if (mod && !ALLOWED_MODALITIES.includes(mod)) {
      return res.status(400).json({ success: false, error: 'Modalidade inválida' });
    }

    // Validate ear
    const earVal = ear ? String(ear).toUpperCase().trim() : null;
    if (earVal && !ALLOWED_EAR.includes(earVal)) {
      return res.status(400).json({ success: false, error: 'Valor EAR inválido' });
    }

    // Sanitize UTMs (truncate to safe length)
    const safeUtm = (v: unknown): string | null => {
      if (!v) return null;
      return String(v).slice(0, MAX_UTM_LEN).trim() || null;
    };
    const utmSrc = safeUtm(utm_source);
    const utmMed = safeUtm(utm_medium);
    const utmCamp = safeUtm(utm_campaign);

    // Build notes with structured metadata
    const meta: string[] = [];
    meta.push(`city_slug=${slug}`);
    if (mod) meta.push(`modality=${mod}`);
    if (earVal) meta.push(`ear=${earVal}`);
    if (utmSrc) meta.push(`utm_source=${utmSrc}`);
    if (utmMed) meta.push(`utm_medium=${utmMed}`);
    if (utmCamp) meta.push(`utm_campaign=${utmCamp}`);
    const notes = meta.join(' | ').slice(0, MAX_NOTES_LEN);

    // Deduplication: same phone + same city_slug (prevent spam)
    const existing = await prisma.crm_leads.findFirst({
      where: {
        phone: digits,
        source: 'CITY_LANDING',
        notes: { contains: `city_slug=${slug}` },
        deleted_at: null,
      },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Você já realizou o pré-cadastro para esta cidade' });
    }

    await prisma.crm_leads.create({
      data: {
        name: trimmedName,
        phone: digits,
        email: email ? String(email).trim().slice(0, 254) : null,
        lead_type: 'DRIVER',
        source: 'CITY_LANDING',
        status: 'NEW',
        priority: 'NORMAL',
        notes,
        captured_by_member_id: null,
        assigned_admin_id: null,
        created_by_admin_id: null,
      },
    });

    res.json({ success: true, message: 'Pré-cadastro registrado com sucesso' });
  } catch (err) {
    console.error('[PUBLIC_CITY_LEAD]', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export default router;
