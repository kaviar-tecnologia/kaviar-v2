import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { auditWrite } from '../middlewares/audit-write';
import bcrypt from 'bcrypt';

const router = Router();

router.use(authenticateAdmin);
router.use(requireSuperAdmin);

// GET /api/admin/staff
router.get('/', async (_req: Request, res: Response) => {
  try {
    const staff = await prisma.admins.findMany({
      where: { role: { in: ['LEAD_AGENT', 'SUPER_ADMIN', 'ANGEL_VIEWER', 'EXECUTIVE_ADMIN'] } },
      select: { id: true, name: true, email: true, phone: true, role: true, is_active: true, lead_regions: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    return res.json({ success: true, data: staff });
  } catch (err) {
    console.error('[STAFF] list error:', err);
    return res.status(500).json({ success: false, error: 'Erro ao listar funcionários' });
  }
});

// POST /api/admin/staff
router.post('/', auditWrite('create_staff', 'admin'), async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, lead_regions, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Nome, email e senha são obrigatórios' });
    }

    const allowedRoles = ['LEAD_AGENT', 'EXECUTIVE_ADMIN'];
    const selectedRole = role || 'LEAD_AGENT';

    if (!allowedRoles.includes(selectedRole)) {
      return res.status(400).json({ success: false, error: 'Perfil administrativo inválido' });
    }

    const existing = await prisma.admins.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email já cadastrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const staff = await prisma.admins.create({
      data: { name, email, password: password_hash, phone, role: selectedRole, is_active: true, lead_regions, must_change_password: true },
      select: { id: true, name: true, email: true, phone: true, role: true, is_active: true, lead_regions: true, created_at: true },
    });

    return res.json({ success: true, data: staff });
  } catch (err) {
    console.error('[STAFF] create error:', err);
    return res.status(500).json({ success: false, error: 'Erro ao criar funcionário' });
  }
});

// PATCH /api/admin/staff/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, phone, is_active, lead_regions, password } = req.body;

    const before = await prisma.admins.findUnique({
      where: { id: req.params.id },
      select: { name: true, phone: true, is_active: true, lead_regions: true },
    });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (is_active !== undefined) data.is_active = is_active;
    if (lead_regions !== undefined) data.lead_regions = lead_regions;
    if (password) data.password = await bcrypt.hash(password, 10);

    const staff = await prisma.admins.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, is_active: true, lead_regions: true, created_at: true },
    });

    const { audit, auditCtx } = require('../utils/audit');
    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'update_staff', entityType: 'admin', entityId: req.params.id, oldValue: before, newValue: data, ipAddress: ctx.ip, userAgent: ctx.ua });

    return res.json({ success: true, data: staff });
  } catch (err) {
    console.error('[STAFF] update error:', err);
    return res.status(500).json({ success: false, error: 'Erro ao atualizar funcionário' });
  }
});

export default router;
