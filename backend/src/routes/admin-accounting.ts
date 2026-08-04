import { Router, Request, Response } from 'express';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';

import {
  createLegalEntitySchema,
  updateLegalEntitySchema,
  listLegalEntitiesQuerySchema,
  createAccountingFirmSchema,
  updateAccountingFirmSchema,
  listAccountingFirmsQuerySchema,
  createAccountantSchema,
  updateAccountantSchema,
  listAccountantsQuerySchema,
  createAccountantLinkSchema,
  updateAccountantLinkSchema,
  listAccountantLinksQuerySchema,
} from '../services/accounting/accounting-validation';

import {
  serializeLegalEntity,
  serializeAccountingFirm,
  serializeAccountantListItem,
  serializeAccountantDetail,
  serializeAccountantLink,
} from '../services/accounting/accounting-serializers';

import * as entitiesService from '../services/accounting/accounting-entities.service';
import * as firmsService from '../services/accounting/accounting-firms.service';
import * as accountantsService from '../services/accounting/accounting-accountants.service';
import * as linksService from '../services/accounting/accounting-links.service';
import * as invitesService from '../services/accounting/accounting-invites.service';
import * as authService from '../services/accounting/accounting-auth.service';
import { writeAccountingAuditTx } from '../services/accounting/accounting-audit';
import { EntityValidationError } from '../services/accounting/accounting-entities.service';
import { prisma } from '../lib/prisma';

const router = Router();

// All routes require SUPER_ADMIN
router.use(authenticateAdmin);
router.use(requireSuperAdmin);

// ═══════════════════════════════════════════════════════════════════
// Legal Entities
// ═══════════════════════════════════════════════════════════════════

router.get('/entities', async (req: Request, res: Response) => {
  try {
    const query = listLegalEntitiesQuerySchema.parse(req.query);
    const result = await entitiesService.listLegalEntities(query);
    res.json({ success: true, data: result.rows.map(serializeLegalEntity), pagination: result.pagination });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Parâmetros inválidos', details: err.errors });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/entities/:id', async (req: Request, res: Response) => {
  try {
    const entity = await entitiesService.getLegalEntity(req.params.id);
    if (!entity) return res.status(404).json({ success: false, error: 'Entidade não encontrada' });
    res.json({ success: true, data: serializeLegalEntity(entity) });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/entities', async (req: Request, res: Response) => {
  try {
    const data = createLegalEntitySchema.parse(req.body);
    const admin = (req as any).admin;
    const entity = await entitiesService.createLegalEntity(data, admin.id, req.ip, req.headers['user-agent']);
    res.status(201).json({ success: true, data: serializeLegalEntity(entity) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/entities/:id', async (req: Request, res: Response) => {
  try {
    const data = updateLegalEntitySchema.parse(req.body);
    const admin = (req as any).admin;
    const entity = await entitiesService.updateLegalEntity(req.params.id, data, admin.id, req.ip, req.headers['user-agent']);
    if (!entity) return res.status(404).json({ success: false, error: 'Entidade não encontrada' });
    res.json({ success: true, data: serializeLegalEntity(entity) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Accounting Firms
// ═══════════════════════════════════════════════════════════════════

router.get('/firms', async (req: Request, res: Response) => {
  try {
    const query = listAccountingFirmsQuerySchema.parse(req.query);
    const result = await firmsService.listAccountingFirms(query);
    res.json({ success: true, data: result.rows.map(serializeAccountingFirm), pagination: result.pagination });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Parâmetros inválidos', details: err.errors });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/firms/:id', async (req: Request, res: Response) => {
  try {
    const firm = await firmsService.getAccountingFirm(req.params.id);
    if (!firm) return res.status(404).json({ success: false, error: 'Escritório não encontrado' });
    res.json({ success: true, data: serializeAccountingFirm(firm) });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/firms', async (req: Request, res: Response) => {
  try {
    const data = createAccountingFirmSchema.parse(req.body);
    const admin = (req as any).admin;
    const firm = await firmsService.createAccountingFirm(data, admin.id, req.ip, req.headers['user-agent']);
    res.status(201).json({ success: true, data: serializeAccountingFirm(firm) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/firms/:id', async (req: Request, res: Response) => {
  try {
    const data = updateAccountingFirmSchema.parse(req.body);
    const admin = (req as any).admin;
    const firm = await firmsService.updateAccountingFirm(req.params.id, data, admin.id, req.ip, req.headers['user-agent']);
    if (!firm) return res.status(404).json({ success: false, error: 'Escritório não encontrado' });
    res.json({ success: true, data: serializeAccountingFirm(firm) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Accountants
// ═══════════════════════════════════════════════════════════════════

router.get('/accountants', async (req: Request, res: Response) => {
  try {
    const query = listAccountantsQuerySchema.parse(req.query);
    const result = await accountantsService.listAccountants(query);
    res.json({ success: true, data: result.rows.map(serializeAccountantListItem), pagination: result.pagination });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Parâmetros inválidos', details: err.errors });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/accountants/:id', async (req: Request, res: Response) => {
  try {
    const accountant = await accountantsService.getAccountant(req.params.id);
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });
    res.json({ success: true, data: serializeAccountantDetail(accountant) });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/accountants', async (req: Request, res: Response) => {
  try {
    const data = createAccountantSchema.parse(req.body);
    const admin = (req as any).admin;
    const accountant = await accountantsService.createAccountant(data, admin.id, req.ip, req.headers['user-agent']);
    res.status(201).json({ success: true, data: serializeAccountantDetail(accountant) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/accountants/:id', async (req: Request, res: Response) => {
  try {
    const data = updateAccountantSchema.parse(req.body);
    const admin = (req as any).admin;
    const accountant = await accountantsService.updateAccountant(req.params.id, data, admin.id, req.ip, req.headers['user-agent']);
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });
    res.json({ success: true, data: serializeAccountantDetail(accountant) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Accountant Entity Links
// ═══════════════════════════════════════════════════════════════════

router.get('/links', async (req: Request, res: Response) => {
  try {
    const query = listAccountantLinksQuerySchema.parse(req.query);
    const result = await linksService.listAccountantLinks(query);
    res.json({ success: true, data: result.rows.map(serializeAccountantLink), pagination: result.pagination });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Parâmetros inválidos', details: err.errors });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/links/:id', async (req: Request, res: Response) => {
  try {
    const link = await linksService.getAccountantLink(req.params.id);
    if (!link) return res.status(404).json({ success: false, error: 'Vínculo não encontrado' });
    res.json({ success: true, data: serializeAccountantLink(link) });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/links', async (req: Request, res: Response) => {
  try {
    const data = createAccountantLinkSchema.parse(req.body);
    const admin = (req as any).admin;
    const link = await linksService.createAccountantLink({ ...data, created_by_admin_id: admin.id }, admin.id, req.ip, req.headers['user-agent']);
    res.status(201).json({ success: true, data: serializeAccountantLink(link) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/links/:id', async (req: Request, res: Response) => {
  try {
    const data = updateAccountantLinkSchema.parse(req.body);
    const admin = (req as any).admin;
    const link = await linksService.updateAccountantLink(req.params.id, data, admin.id, req.ip, req.headers['user-agent']);
    if (!link) return res.status(404).json({ success: false, error: 'Vínculo não encontrado' });
    res.json({ success: true, data: serializeAccountantLink(link) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Admin Actions on Accountants (invite, block, unblock, etc.)
// ═══════════════════════════════════════════════════════════════════

router.post('/accountants/:id/invite', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const result = await invitesService.createInvite(req.params.id, admin.id, req.ip, req.headers['user-agent']);
    res.status(201).json({ success: true, data: { invite_id: result.invite.id, token: result.rawToken } });
  } catch (err: any) {
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/accountants/:id/reinvite', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const accountant = await prisma.accountants.findUnique({ where: { id: req.params.id } });
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });
    if (accountant.status !== 'INVITED') {
      return res.status(400).json({ success: false, error: 'Somente contadores com status INVITED podem ser reinconvidados' });
    }
    const result = await invitesService.createInvite(req.params.id, admin.id, req.ip, req.headers['user-agent']);
    res.status(201).json({ success: true, data: { invite_id: result.invite.id, token: result.rawToken } });
  } catch (err: any) {
    if (err instanceof EntityValidationError) return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/accountants/:id/block', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const accountant = await prisma.accountants.findUnique({ where: { id: req.params.id } });
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.accountants.update({
        where: { id: req.params.id },
        data: { status: 'BLOCKED', is_active: false },
      });
      // Revoke all active sessions
      await tx.accountant_sessions.updateMany({
        where: { accountant_id: req.params.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revoked_at: new Date(), revocation_reason: 'ADMIN_BLOCK' },
      });
      await writeAccountingAuditTx(tx, {
        adminId: admin.id,
        action: 'ACCOUNTANT_BLOCK',
        entityType: 'accountant',
        entityId: req.params.id,
        oldValue: { status: accountant.status },
        newValue: { status: 'BLOCKED' },
        reason: req.body.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/accountants/:id/unblock', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const accountant = await prisma.accountants.findUnique({ where: { id: req.params.id } });
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });
    if (accountant.status !== 'BLOCKED') {
      return res.status(400).json({ success: false, error: 'Somente contadores bloqueados podem ser desbloqueados' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.accountants.update({
        where: { id: req.params.id },
        data: { status: 'ACTIVE', is_active: true, locked_until: null, failed_login_count: 0 },
      });
      await writeAccountingAuditTx(tx, {
        adminId: admin.id,
        action: 'ACCOUNTANT_UNBLOCK',
        entityType: 'accountant',
        entityId: req.params.id,
        oldValue: { status: 'BLOCKED' },
        newValue: { status: 'ACTIVE' },
        reason: req.body.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/accountants/:id/suspend', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const accountant = await prisma.accountants.findUnique({ where: { id: req.params.id } });
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.accountants.update({
        where: { id: req.params.id },
        data: { status: 'SUSPENDED' },
      });
      // Revoke all active sessions
      await tx.accountant_sessions.updateMany({
        where: { accountant_id: req.params.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revoked_at: new Date(), revocation_reason: 'ADMIN_SUSPEND' },
      });
      await writeAccountingAuditTx(tx, {
        adminId: admin.id,
        action: 'ACCOUNTANT_SUSPEND',
        entityType: 'accountant',
        entityId: req.params.id,
        oldValue: { status: accountant.status },
        newValue: { status: 'SUSPENDED' },
        reason: req.body.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/accountants/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const accountant = await prisma.accountants.findUnique({ where: { id: req.params.id } });
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });
    if (accountant.status !== 'SUSPENDED') {
      return res.status(400).json({ success: false, error: 'Somente contadores suspensos podem ser reativados' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.accountants.update({
        where: { id: req.params.id },
        data: { status: 'ACTIVE', is_active: true },
      });
      await writeAccountingAuditTx(tx, {
        adminId: admin.id,
        action: 'ACCOUNTANT_REACTIVATE',
        entityType: 'accountant',
        entityId: req.params.id,
        oldValue: { status: 'SUSPENDED' },
        newValue: { status: 'ACTIVE' },
        reason: req.body.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/accountants/:id/revoke-sessions', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const accountant = await prisma.accountants.findUnique({ where: { id: req.params.id } });
    if (!accountant) return res.status(404).json({ success: false, error: 'Contador não encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.accountant_sessions.updateMany({
        where: { accountant_id: req.params.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revoked_at: new Date(), revocation_reason: 'ADMIN_REVOKE' },
      });
      await writeAccountingAuditTx(tx, {
        adminId: admin.id,
        action: 'ACCOUNTANT_REVOKE_SESSIONS',
        entityType: 'accountant',
        entityId: req.params.id,
        reason: req.body.reason || 'Admin revoked all sessions',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const adminAccountingRoutes = router;
export default router;
