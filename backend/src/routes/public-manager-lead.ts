import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const MAX_NAME_LEN = 120;
const MAX_CITY_LEN = 120;
const MAX_MESSAGE_LEN = 700;
const MAX_UTM_LEN = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max: number): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanUtm(value: unknown): string | null {
  if (!value) return null;
  return cleanText(value, MAX_UTM_LEN) || null;
}

// POST /api/public/manager-lead — candidatura pública de Gestor Territorial
router.post('/manager-lead', async (req: Request, res: Response) => {
  try {
    const { name, phone, email, city, state, message, utm_source, utm_medium, utm_campaign } = req.body;

    if (!name || !phone || !city || !state) {
      return res.status(400).json({ success: false, error: 'Nome, WhatsApp, cidade e UF são obrigatórios' });
    }

    const safeName = cleanText(name, MAX_NAME_LEN);
    const safeCity = cleanText(city, MAX_CITY_LEN);
    const safeState = cleanText(state, 2).toUpperCase();
    const digits = String(phone).replace(/\D/g, '').slice(0, 15);
    const safeEmail = email ? cleanText(email, 254).toLowerCase() : null;
    const safeMessage = message ? cleanText(message, MAX_MESSAGE_LEN) : null;

    if (safeName.length < 2) {
      return res.status(400).json({ success: false, error: 'Nome deve ter pelo menos 2 caracteres' });
    }
    if (safeCity.length < 2) {
      return res.status(400).json({ success: false, error: 'Cidade inválida' });
    }
    if (!/^[A-Z]{2}$/.test(safeState)) {
      return res.status(400).json({ success: false, error: 'UF inválida' });
    }
    if (digits.length < 10) {
      return res.status(400).json({ success: false, error: 'WhatsApp deve ter pelo menos 10 dígitos' });
    }
    if (safeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
      return res.status(400).json({ success: false, error: 'Email inválido' });
    }

    // Não duplica uma candidatura ainda em acompanhamento.
    const existing = await prisma.crm_leads.findFirst({
      where: {
        phone: digits,
        lead_type: 'TERRITORIAL_MANAGER',
        deleted_at: null,
        status: { notIn: ['LOST', 'REJECTED'] },
      },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Já existe um cadastro de interesse em acompanhamento para este WhatsApp',
      });
    }

    // Se a cidade já existir no mapa territorial, vincula o lead ao território.
    // Territórios legados com id não-UUID não podem ser gravados em crm_leads.territory_id.
    const territory = await prisma.operational_territories.findFirst({
      where: {
        city_name: { equals: safeCity, mode: 'insensitive' },
        uf: safeState,
        status: { not: 'inactive' },
      },
      select: { id: true },
    });
    const territoryId = territory?.id && UUID_RE.test(territory.id) ? territory.id : null;

    const meta: string[] = [
      `Cidade/UF de interesse: ${safeCity}/${safeState}`,
      'Origem: página pública /gestor',
    ];
    const utmSource = cleanUtm(utm_source);
    const utmMedium = cleanUtm(utm_medium);
    const utmCampaign = cleanUtm(utm_campaign);
    if (utmSource) meta.push(`utm_source=${utmSource}`);
    if (utmMedium) meta.push(`utm_medium=${utmMedium}`);
    if (utmCampaign) meta.push(`utm_campaign=${utmCampaign}`);
    if (safeMessage) meta.push(`Mensagem: ${safeMessage}`);

    await prisma.crm_leads.create({
      data: {
        name: safeName,
        phone: digits,
        email: safeEmail,
        lead_type: 'TERRITORIAL_MANAGER',
        source: 'WEBSITE',
        status: 'NEW',
        priority: 'NORMAL',
        notes: meta.join(' | '),
        territory_id: territoryId,
        captured_by_member_id: null,
        assigned_admin_id: null,
        created_by_admin_id: null,
      },
    });

    return res.json({
      success: true,
      message: 'Cadastro de interesse recebido. A equipe KAVIAR analisará as informações e poderá entrar em contato.',
    });
  } catch (err) {
    console.error('[PUBLIC_MANAGER_LEAD]', err);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export default router;
