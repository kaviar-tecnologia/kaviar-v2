import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateAdmin } from '../middlewares/auth';
import { requireTerritoryScope } from '../middlewares/require-territory-scope';
import { applyTerritoryScope } from '../middlewares/territory-scope';

const router = Router();
router.use(authenticateAdmin);

const OPERATOR_AGENT_PREFIX = 'operator:';

/** Find the referral_agent linked to this operator admin */
async function findOperatorAgent(adminId: string) {
  return prisma.referral_agents.findFirst({
    where: { email: OPERATOR_AGENT_PREFIX + adminId },
  });
}

// GET /api/admin/operator/referrals — stats + code
router.get('/', applyTerritoryScope, requireTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin.role !== 'TERRITORIAL_OPERATOR' && admin.role !== 'TERRITORIAL_MANAGER' && admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const agent = await findOperatorAgent(admin.id);
    if (!agent) {
      return res.json({
        success: true,
        data: { has_code: false, message: 'Nenhum link de indicação gerado. Use "Gerar link" para ativar.' },
      });
    }
    if (!agent.referral_code || !agent.is_active) {
      return res.json({
        success: true,
        data: {
          has_code: false,
          message: agent.referral_code
            ? 'O código de indicação está inativo. Solicite revisão à central.'
            : 'O cadastro de indicação não possui código. Solicite revisão à central.',
        },
      });
    }

    const referrals = await prisma.referrals.findMany({
      where: { agent_id: agent.id },
      select: { status: true },
    });

    const total = referrals.length;
    const pending = referrals.filter(r => r.status === 'pending').length;
    const qualified = referrals.filter(r => r.status === 'qualified').length;
    const rejected = referrals.filter(r => r.status === 'rejected').length;

    res.json({
      success: true,
      data: {
        has_code: true,
        referral_code: agent.referral_code,
        referral_link: `https://kaviar.com.br/motorista?ref=${agent.referral_code}`,
        stats: { total, pending, qualified, rejected },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar indicações' });
  }
});

// POST /api/admin/operator/referrals/generate — create referral_agent for operator
router.post('/generate', applyTerritoryScope, requireTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin.role !== 'TERRITORIAL_OPERATOR' && admin.role !== 'TERRITORIAL_MANAGER' && admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Check if already exists
    const existing = await findOperatorAgent(admin.id);
    if (existing) {
      return res.json({
        success: true,
        data: { referral_code: existing.referral_code, referral_link: `https://kaviar.com.br/motorista?ref=${existing.referral_code}` },
      });
    }

    // Generate unique code with TERR prefix
    const code = await generateTerritoryCode(admin.name || 'TERR');

    // Get admin phone for the referral_agent (required field)
    const adminRecord = await prisma.admins.findUnique({ where: { id: admin.id }, select: { phone: true, name: true } });
    const phone = adminRecord?.phone || `op-${admin.id.slice(0, 8)}`;

    const agent = await prisma.referral_agents.create({
      data: {
        name: adminRecord?.name || admin.name || 'Operador Territorial',
        phone,
        email: OPERATOR_AGENT_PREFIX + admin.id,
        referral_code: code,
        is_active: true,
        terms_accepted_at: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: { referral_code: agent.referral_code, referral_link: `https://kaviar.com.br/motorista?ref=${agent.referral_code}` },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Código já existe. Tente novamente.' });
    }
    res.status(500).json({ success: false, error: 'Erro ao gerar link de indicação' });
  }
});

/** Generate a territory-prefixed code */
async function generateTerritoryCode(name: string): Promise<string> {
  const chars = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const prefix = 'TERR';
  for (let i = 0; i < 10; i++) {
    const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const code = `${prefix}${suffix}`;
    const exists = await prisma.referral_agents.findFirst({ where: { referral_code: code } });
    if (!exists) return code;
  }
  // Fallback: use name-based
  const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${base}${rand}`;
}

export default router;
