import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { requireTerritoryScope } from '../middlewares/require-territory-scope';
import {
  evaluateTerritorialManagerFinancialProfile,
  financialEligibilityReasonLabel,
} from '../services/contracts/territorial-manager-financial-eligibility';

const router = Router();
router.use(authenticateAdmin);
router.use(requireRole(['TERRITORIAL_MANAGER', 'SUPER_ADMIN']));
router.use(applyTerritoryScope);
router.use(requireTerritoryScope);

// ─── GET /api/admin/manager/finance/summary ──────────────────────────────────
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const territoryIds = scope?.territoryIds || [];

    if (territoryIds.length === 0) {
      return res.json({ success: true, data: { empty: true, message: 'Sem território vinculado' } });
    }

    const period = (req.query.period as string) || '30d';
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const managerId = admin.role === 'TERRITORIAL_MANAGER' ? admin.id : null;
    const ledgerWhere: any = {
      territory_id: { in: territoryIds },
      created_at: { gte: since },
      ...(managerId ? { manager_id: managerId } : { manager_id: { not: null } }),
    };

    const [platformAgg, managerAgg, recognizedRides, activeAssignments, managerProfile] = await Promise.all([
      prisma.territory_ledger.aggregate({
        where: { ...ledgerWhere, entry_type: 'platform_fee' },
        _sum: { amount_cents: true },
      }),
      prisma.territory_ledger.aggregate({
        where: { ...ledgerWhere, entry_type: 'fee_share' },
        _sum: { amount_cents: true },
      }),
      prisma.ride_fee_splits.count({
        where: {
          territory_id: { in: territoryIds },
          recognized_at: { gte: since },
          ...(managerId ? { manager_id: managerId } : { manager_id: { not: null } }),
        },
      }),
      managerId
        ? prisma.territory_manager_assignments.findMany({
            where: {
              admin_id: managerId,
              territory_id: { in: territoryIds },
              status: 'active',
              started_at: { lte: new Date() },
              OR: [{ ended_at: null }, { ended_at: { gt: new Date() } }],
            },
            select: { id: true, territory_id: true, status: true, started_at: true, ended_at: true },
          })
        : Promise.resolve([]),
      managerId
        ? prisma.operator_profiles.findUnique({
            where: { admin_id: managerId },
            select: {
              relationship_type: true,
              is_active: true,
              document_status: true,
              contract_status: true,
              terms_version: true,
              contract_url: true,
              pix_key: true,
              responsibility_terms_accepted_at: true,
              confidentiality_terms_accepted_at: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const platformFeeCents = platformAgg._sum.amount_cents || 0n;
    const managerShareCents = managerAgg._sum.amount_cents || 0n;
    const profileEligibility = managerId
      ? evaluateTerritorialManagerFinancialProfile(managerProfile)
      : null;
    const financialActivationActive = managerId
      ? activeAssignments.length > 0 && profileEligibility?.eligible === true
      : null;
    const financialActivationReason = managerId && !financialActivationActive
      ? (profileEligibility?.eligible === false
          ? financialEligibilityReasonLabel(profileEligibility.reason)
          : 'Sem assignment ativo')
      : null;

    res.json({
      success: true,
      data: {
        period,
        rides_completed: recognizedRides,
        gross_estimated: null,
        platform_fee: Number(platformFeeCents) / 100,
        regional_estimated: Number(managerShareCents) / 100,
        partner_commissions: 0,
        net_estimated: Number(managerShareCents) / 100,
        has_rule: true,
        regional_percent: 40,
        source: 'wallet_v2_territory_ledger',
        financial_activation_active: financialActivationActive,
        financial_activation_reason: financialActivationReason,
        active_assignment_ids: activeAssignments.map(a => a.id),
        note: financialActivationActive === false
          ? `Sem Ativação Financeira elegível${financialActivationReason ? `: ${financialActivationReason}` : ''}. Valores eventualmente exibidos no período são históricos já reconhecidos antes do bloqueio/desativação.`
          : 'Participação reconhecida pelo Wallet V2. Somente assignment ativo + perfil totalmente elegível v1.2 geram 40%; caso contrário, 0% ao gestor.',
      },
    });
  } catch (error: any) {
    console.error('[MANAGER_FINANCE_SUMMARY]', error.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar resumo financeiro' });
  }
});

// ─── GET /api/admin/manager/finance/payouts ──────────────────────────────────
// Read-only view of the canonical Wallet V2 payout-cycle engine.
router.get('/payouts', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const territoryIds = scope?.territoryIds || [];

    if (territoryIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const cycles = await prisma.territory_payout_cycles.findMany({
      where: {
        territory_id: { in: territoryIds },
        ...(admin.role === 'TERRITORIAL_MANAGER' ? { manager_id: admin.id } : {}),
      },
      select: {
        id: true,
        reference_month: true,
        gross_manager_commission_cents: true,
        approved_amount_cents: true,
        status: true,
        calculated_at: true,
        approved_at: true,
        created_at: true,
      },
      orderBy: [{ reference_month: 'desc' }, { created_at: 'desc' }],
      take: 12,
    });

    res.json({
      success: true,
      data: cycles.map(cycle => ({
        id: cycle.id,
        reference_month: cycle.reference_month,
        calculated_amount: Number(cycle.gross_manager_commission_cents) / 100,
        approved_amount: Number(cycle.approved_amount_cents) / 100,
        status: cycle.status,
        paid_at: null,
        payment_method: null,
        receipt_url: null,
        notes: null,
        created_at: cycle.created_at,
        calculated_at: cycle.calculated_at,
        approved_at: cycle.approved_at,
        source: 'wallet_v2_payout_cycle',
      })),
    });
  } catch (error: any) {
    console.error('[MANAGER_FINANCE_PAYOUTS]', error.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar repasses' });
  }
});

// Legacy self-service transitions are disabled for v1.2. Finance/central owns the payout-cycle workflow.
router.post('/payouts/:id/request', async (_req: Request, res: Response) => {
  return res.status(409).json({
    success: false,
    error: 'MANAGER_PAYOUT_SELF_SERVICE_DISABLED',
    message: 'A apuração e o fluxo de pagamento são controlados pela central KAVIAR no motor financeiro Wallet V2.',
  });
});

router.post('/payouts/:id/confirm-received', async (_req: Request, res: Response) => {
  return res.status(409).json({
    success: false,
    error: 'MANAGER_PAYOUT_SELF_SERVICE_DISABLED',
    message: 'A confirmação financeira é registrada pelo fluxo central e pelas evidências de pagamento do Wallet V2.',
  });
});

// ─── GET /api/admin/manager/finance/rules ────────────────────────────────────
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const territoryIds = scope?.territoryIds || [];

    if (territoryIds.length === 0) {
      return res.json({ success: true, data: null });
    }

    let financialActivationActive: boolean | null = null;
    let financialActivationReason: string | null = null;

    if (admin.role === 'TERRITORIAL_MANAGER') {
      const [activeAssignments, profile] = await Promise.all([
        prisma.territory_manager_assignments.count({
          where: {
            admin_id: admin.id,
            territory_id: { in: territoryIds },
            status: 'active',
            started_at: { lte: new Date() },
            OR: [{ ended_at: null }, { ended_at: { gt: new Date() } }],
          },
        }),
        prisma.operator_profiles.findUnique({
          where: { admin_id: admin.id },
          select: {
            relationship_type: true,
            is_active: true,
            document_status: true,
            contract_status: true,
            terms_version: true,
            contract_url: true,
            pix_key: true,
            responsibility_terms_accepted_at: true,
            confidentiality_terms_accepted_at: true,
          },
        }),
      ]);
      const eligibility = evaluateTerritorialManagerFinancialProfile(profile);
      financialActivationActive = activeAssignments > 0 && eligibility.eligible;
      financialActivationReason = financialActivationActive
        ? null
        : (eligibility.eligible ? 'Sem assignment ativo' : financialEligibilityReasonLabel(eligibility.reason));
    }

    res.json({
      success: true,
      data: {
        matrix_share_percent: 60,
        regional_share_percent: 40,
        partner_commission_percent: 0,
        valid_from: null,
        description: 'Regra contratual v1.2: 40% somente com assignment ativo e perfil totalmente elegível; qualquer gate pendente = 0% ao Gestor e 100% da Taxa da Plataforma para a KAVIAR.',
        source: 'contract_v1.2_wallet_v2',
        financial_activation_active: financialActivationActive,
        financial_activation_reason: financialActivationReason,
      },
    });
  } catch (error: any) {
    console.error('[MANAGER_FINANCE_RULES]', error.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar regra financeira' });
  }
});

// ─── Team Members ───────────────────────────────────────────────────────────

// GET /api/admin/manager/finance/team
router.get('/team', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const where: any = {};
    if (admin.role !== 'SUPER_ADMIN') where.manager_admin_id = admin.id;
    const members = await prisma.manager_team_members.findMany({ where, orderBy: { created_at: 'desc' } });
    res.json({ success: true, data: members });
  } catch { res.status(500).json({ success: false, error: 'Erro ao listar equipe' }); }
});

// POST /api/admin/manager/finance/team
router.post('/team', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const { name, phone, role_type, notes, cpf, address, city, state, zipcode, pix_key, pix_key_type } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nome obrigatório' });
    const rawTerritoryId = scope?.territoryIds?.[0] || null;
    const territory_id = rawTerritoryId || null;
    const member = await prisma.manager_team_members.create({ data: { manager_admin_id: admin.id, territory_id, name, phone: phone || null, role_type: role_type || 'outro', notes: notes || null, cpf: cpf || null, address: address || null, city: city || null, state: state || null, zipcode: zipcode || null, pix_key: pix_key || null, pix_key_type: pix_key_type || null } });
    res.status(201).json({ success: true, data: member });
  } catch { res.status(500).json({ success: false, error: 'Erro ao cadastrar membro' }); }
});

// PATCH /api/admin/manager/finance/team/:id
router.patch('/team/:id', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const where: any = { id: req.params.id };
    if (admin.role !== 'SUPER_ADMIN') where.manager_admin_id = admin.id;
    const existing = await prisma.manager_team_members.findFirst({ where });
    if (!existing) return res.status(404).json({ success: false, error: 'Membro não encontrado' });
    const { name, phone, role_type, status, notes, cpf, address, city, state, zipcode, pix_key, pix_key_type, contract_status, contract_version, contract_notes } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone || null;
    if (role_type !== undefined) data.role_type = role_type;
    if (status !== undefined && ['active', 'pending', 'inactive'].includes(status)) data.status = status;
    if (notes !== undefined) data.notes = notes || null;
    if (cpf !== undefined) data.cpf = cpf || null;
    if (address !== undefined) data.address = address || null;
    if (city !== undefined) data.city = city || null;
    if (state !== undefined) data.state = state || null;
    if (zipcode !== undefined) data.zipcode = zipcode || null;
    if (pix_key !== undefined) data.pix_key = pix_key || null;
    if (pix_key_type !== undefined) data.pix_key_type = pix_key_type || null;
    if (contract_status !== undefined && ['pending', 'delivered', 'signed', 'waived'].includes(contract_status)) {
      data.contract_status = contract_status;
      if (contract_status === 'signed' && !existing.contract_signed_at) data.contract_signed_at = new Date();
    }
    if (contract_version !== undefined) data.contract_version = contract_version || null;
    if (contract_notes !== undefined) data.contract_notes = contract_notes || null;
    const updated = await prisma.manager_team_members.update({ where: { id: existing.id }, data });
    res.json({ success: true, data: updated });
  } catch { res.status(500).json({ success: false, error: 'Erro ao atualizar membro' }); }
});

// POST /api/admin/manager/finance/team/:id/generate-code
router.post('/team/:id/generate-code', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const where: any = { id: req.params.id };
    if (admin.role !== 'SUPER_ADMIN') where.manager_admin_id = admin.id;
    const member = await prisma.manager_team_members.findFirst({ where });
    if (!member) return res.status(404).json({ success: false, error: 'Membro não encontrado' });
    if (member.public_referral_code) return res.json({ success: true, data: { public_referral_code: member.public_referral_code }, message: 'Código já existe' });
    const prefix = member.name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'MMBR';
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `KV-${prefix}-${rand}`;
    const updated = await prisma.manager_team_members.update({ where: { id: member.id }, data: { public_referral_code: code } });
    res.json({ success: true, data: { public_referral_code: updated.public_referral_code } });
  } catch (err: any) {
    if (err?.code === 'P2002') return res.status(409).json({ success: false, error: 'Colisão de código. Tente novamente.' });
    res.status(500).json({ success: false, error: 'Erro ao gerar código' });
  }
});

// ─── Team Commissions ───────────────────────────────────────────────────────

// GET /api/admin/manager/finance/team-lead-stats
router.get('/team-lead-stats', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const memberWhere: any = {};
    if (admin.role !== 'SUPER_ADMIN') memberWhere.manager_admin_id = admin.id;
    const members = await prisma.manager_team_members.findMany({ where: memberWhere, select: { id: true, name: true } });
    const memberIds = members.map(m => m.id);
    if (memberIds.length === 0) return res.json({ success: true, data: [], leads_today: 0, leads_month: 0, by_type: {} });
    const baseWhere = { captured_by_member_id: { in: memberIds }, deleted_at: null };
    const [grouped, groupedType, todayCount, monthCount] = await Promise.all([
      prisma.crm_leads.groupBy({ by: ['captured_by_member_id', 'status'], where: baseWhere, _count: true }),
      prisma.crm_leads.groupBy({ by: ['lead_type'], where: baseWhere, _count: true }),
      prisma.crm_leads.count({ where: { ...baseWhere, created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      prisma.crm_leads.count({ where: { ...baseWhere, created_at: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    ]);
    const statsMap: Record<string, { total: number; by_status: Record<string, number> }> = {};
    grouped.forEach(g => {
      const mid = g.captured_by_member_id!;
      if (!statsMap[mid]) statsMap[mid] = { total: 0, by_status: {} };
      statsMap[mid].total += g._count;
      statsMap[mid].by_status[g.status] = (statsMap[mid].by_status[g.status] || 0) + g._count;
    });
    const by_type: Record<string, number> = {};
    groupedType.forEach(g => { by_type[g.lead_type] = g._count; });
    const data = members.map(m => ({ member_id: m.id, member_name: m.name, total_leads: statsMap[m.id]?.total || 0, by_status: statsMap[m.id]?.by_status || {} }));
    res.json({ success: true, data, leads_today: todayCount, leads_month: monthCount, by_type });
  } catch { res.status(500).json({ success: false, error: 'Erro ao buscar stats de leads' }); }
});

// GET /api/admin/manager/finance/team-commissions (all commissions for manager)
router.get('/team-commissions', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const where: any = {};
    if (admin.role !== 'SUPER_ADMIN') where.manager_admin_id = admin.id;
    const commissions = await prisma.manager_team_commissions.findMany({ where, include: { member: { select: { id: true, name: true, role_type: true } } }, orderBy: { created_at: 'desc' } });
    res.json({ success: true, data: commissions });
  } catch { res.status(500).json({ success: false, error: 'Erro ao listar comissões' }); }
});

// GET /api/admin/manager/finance/team/:memberId/commissions
router.get('/team/:memberId/commissions', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const memberWhere: any = { id: req.params.memberId };
    if (admin.role !== 'SUPER_ADMIN') memberWhere.manager_admin_id = admin.id;
    const member = await prisma.manager_team_members.findFirst({ where: memberWhere });
    if (!member) return res.status(404).json({ success: false, error: 'Membro não encontrado' });
    const commissions = await prisma.manager_team_commissions.findMany({ where: { member_id: member.id }, orderBy: { created_at: 'desc' } });
    res.json({ success: true, data: commissions });
  } catch { res.status(500).json({ success: false, error: 'Erro ao listar comissões' }); }
});

// POST /api/admin/manager/finance/team/:memberId/commissions
router.post('/team/:memberId/commissions', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin.role === 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'SUPER_ADMIN não registra comissões internas' });
    const member = await prisma.manager_team_members.findFirst({ where: { id: req.params.memberId, manager_admin_id: admin.id } });
    if (!member) return res.status(404).json({ success: false, error: 'Membro não encontrado' });
    if (member.contract_status !== 'signed') return res.status(400).json({ success: false, error: 'Membro deve ter termo assinado para registrar comissão' });
    const { description, amount_cents, reference_month, notes } = req.body;
    if (!description || !amount_cents || amount_cents <= 0) return res.status(400).json({ success: false, error: 'Descrição e valor são obrigatórios' });
    if (reference_month && !/^\d{4}-\d{2}$/.test(reference_month)) return res.status(400).json({ success: false, error: 'Mês referência deve estar no formato AAAA-MM' });
    const scope = (req as any).territoryScope;
    const territory_id = scope?.territoryIds?.[0] || null;
    const commission = await prisma.manager_team_commissions.create({ data: { manager_admin_id: admin.id, member_id: member.id, territory_id, description, amount_cents: Math.round(amount_cents), reference_month: reference_month || null, notes: notes || null } });
    res.status(201).json({ success: true, data: commission });
  } catch { res.status(500).json({ success: false, error: 'Erro ao registrar comissão' }); }
});

// PATCH /api/admin/manager/finance/team/commissions/:id
router.patch('/team/commissions/:id', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin.role === 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'SUPER_ADMIN não altera comissões internas nesta fase' });
    const existing = await prisma.manager_team_commissions.findFirst({ where: { id: req.params.id, manager_admin_id: admin.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Comissão não encontrada' });
    const { status, notes } = req.body;
    const data: any = {};
    if (status && ['pending', 'agreed', 'paid_by_manager', 'canceled'].includes(status)) data.status = status;
    if (notes !== undefined) data.notes = notes || null;
    const updated = await prisma.manager_team_commissions.update({ where: { id: existing.id }, data });
    res.json({ success: true, data: updated });
  } catch { res.status(500).json({ success: false, error: 'Erro ao atualizar comissão' }); }
});

export default router;
