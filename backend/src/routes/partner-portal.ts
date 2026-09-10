import { Router, Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { randomInt, createHash } from 'crypto';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email/email.service';
import { whatsappEvents } from '../modules/whatsapp';
import {
  ArPlaceServiceError,
  getPartnerOwnedHotelArPlaceById,
  listPartnerOwnedHotelArPlaces,
  upsertPartnerOwnedHotelArPlaceChangeRequest,
} from '../services/ar-places/ar-places.service';
import { arPlaceIdParamSchema, partnerArPlaceChangeRequestBodySchema } from '../services/ar-places/ar-places-validation';
import { serializeArPlaceChangeRequest, serializePartnerArPlace } from '../services/ar-places/ar-places-serializers';

const router = Router();

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// --- Auth middleware for partner users ---
function authenticatePartner(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
  if (!token) return res.status(401).json({ success: false, error: 'Token ausente' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (decoded.type !== 'partner') return res.status(403).json({ success: false, error: 'Acesso negado' });
    (req as any).partnerUser = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }
}

function arPlaceServiceError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof ArPlaceServiceError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  return res.status(500).json({ success: false, error: fallbackMessage });
}

// --- Login ---
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email e senha obrigatórios' });

    const user = await prisma.partner_users.findUnique({ where: { email: email.toLowerCase().trim() }, include: { partner: { select: { id: true, name: true, status: true, plan: true } } } });
    if (!user || !user.is_active) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    if (user.partner.status === 'archived') return res.status(403).json({ success: false, error: 'Parceiro arquivado' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });

    await prisma.partner_users.update({ where: { id: user.id }, data: { last_login_at: new Date() } });

    const token = jwt.sign({ type: 'partner', userId: user.id, partnerId: user.partner_id, partnerName: user.partner.name }, config.jwtSecret, { expiresIn: '7d' });

    res.json({ success: true, token, data: { name: user.name, partner_name: user.partner.name, plan: user.partner.plan } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro no login' });
  }
});

// --- Forgot / Reset password ---
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) return res.status(400).json({ success: false, error: 'Informe email ou telefone' });

    // Find user by email or phone — never reveal if exists
    let user: any = null;
    if (email) {
      user = await prisma.partner_users.findUnique({ where: { email: email.toLowerCase().trim() }, include: { partner: { select: { responsible_phone: true } } } });
    } else if (phone) {
      const normalized = phone.replace(/\D/g, '');
      const partner = await prisma.territorial_partners.findFirst({ where: { responsible_phone: { contains: normalized.slice(-9) } }, include: { users: { where: { is_active: true }, take: 1 } } });
      if (partner?.users?.[0]) {
        user = { ...partner.users[0], partner: { responsible_phone: partner.responsible_phone } };
      }
    }

    if (user && user.is_active !== false) {
      const code = String(randomInt(100000, 999999));

      // Invalidate previous pending codes
      await prisma.partner_password_resets.updateMany({
        where: { partner_user_id: user.id, used_at: null },
        data: { used_at: new Date() },
      });

      // Store hashed code
      await prisma.partner_password_resets.create({
        data: {
          partner_user_id: user.id,
          code_hash: hashCode(code),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
          request_ip: req.ip || null,
          user_agent: req.headers['user-agent'] || null,
        },
      });

      // WhatsApp as primary channel, email as fallback
      const userPhone = user.partner?.responsible_phone;
      let sentViaWhatsApp = false;

      if (userPhone) {
        try {
          const phoneDigits = userPhone.replace(/\D/g, '');
          const phoneE164 = phoneDigits.startsWith('55') ? `+${phoneDigits}` : `+55${phoneDigits}`;
          await whatsappEvents.authVerificationCode(phoneE164, { '1': code });
          sentViaWhatsApp = true;
        } catch (e) {
          // WhatsApp failed, fall through to email
        }
      }

      if (!sentViaWhatsApp && user.email) {
        await emailService.sendMail({
          to: user.email,
          subject: 'KAVIAR — Código de recuperação',
          text: `Seu código de recuperação: ${code}\nVálido por 10 minutos.`,
          html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px"><h2 style="color:#B8942E">KAVIAR</h2><p>Seu código de recuperação:</p><h1 style="letter-spacing:8px;text-align:center">${code}</h1><p style="color:#666;font-size:12px">Válido por 10 minutos. Se você não solicitou, ignore este email.</p></div>`,
        });
      }
    }

    res.json({ success: true, message: 'Se o cadastro existir, você receberá um código por WhatsApp ou email.' });
  } catch (error) {
    res.json({ success: true, message: 'Se o cadastro existir, você receberá um código por WhatsApp ou email.' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, phone, code, new_password } = req.body;
    if ((!email && !phone) || !code || !new_password) return res.status(400).json({ success: false, error: 'Informe (email ou telefone), code e new_password' });
    if (new_password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres' });

    // Find user by email or phone
    let user: any = null;
    if (email) {
      user = await prisma.partner_users.findUnique({ where: { email: email.toLowerCase().trim() } });
    } else if (phone) {
      const normalized = phone.replace(/\D/g, '');
      const partner = await prisma.territorial_partners.findFirst({ where: { responsible_phone: { contains: normalized.slice(-9) } }, include: { users: { where: { is_active: true }, take: 1 } } });
      if (partner?.users?.[0]) user = partner.users[0];
    }
    if (!user) return res.status(400).json({ success: false, error: 'Código inválido ou expirado' });

    // Find valid, unused, non-expired reset for this user
    const reset = await prisma.partner_password_resets.findFirst({
      where: { partner_user_id: user.id, used_at: null, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
    });

    if (!reset || reset.code_hash !== hashCode(code)) {
      return res.status(400).json({ success: false, error: 'Código inválido ou expirado' });
    }

    // Mark as used + invalidate all pending codes for this user
    await prisma.partner_password_resets.updateMany({
      where: { partner_user_id: user.id, used_at: null },
      data: { used_at: new Date() },
    });

    const password_hash = await bcrypt.hash(new_password, 10);
    await prisma.partner_users.update({ where: { id: user.id }, data: { password_hash } });

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao redefinir senha' });
  }
});

// --- Change password (authenticated) ---
router.post('/change-password', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ success: false, error: 'current_password e new_password obrigatórios' });
    if (new_password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres' });

    const { userId } = (req as any).partnerUser;
    const user = await prisma.partner_users.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Senha atual incorreta' });

    const password_hash = await bcrypt.hash(new_password, 10);
    await prisma.partner_users.update({ where: { id: userId }, data: { password_hash } });

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao alterar senha' });
  }
});

// --- Protected routes (partner scope) ---

// Get own partner summary
router.get('/me', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const partner = await prisma.territorial_partners.findUnique({ where: { id: partnerId }, select: { name: true, partner_type: true, plan: true, status: true, commission_percent: true, referral_code: true, logo_url: true } });
    // Generate presigned logo URL
    let logo_url = partner?.logo_url || null;
    if (logo_url) {
      try {
        const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const s3 = new S3Client({ region: 'us-east-2' });
        const list: any = await s3.send(new ListObjectsV2Command({ Bucket: 'kaviar-uploads-847895361928', Prefix: `partner-logos/${partnerId}`, MaxKeys: 5 }));
        const key = list.Contents?.sort((a: any, b: any) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime())?.[0]?.Key;
        if (key) logo_url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: 'kaviar-uploads-847895361928', Key: key }), { expiresIn: 3600 });
      } catch {}
    }
    res.json({ success: true, data: { ...partner, logo_url } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

// Drivers linked to this partner (read-only, no sensitive data)
router.get('/drivers', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const drivers = await prisma.drivers.findMany({
      where: { territorial_partner_id: partnerId },
      select: { id: true, name: true, phone: true, status: true, territorial_partner_linked_at: true },
    });
    const driverIds = drivers.map(d => d.id);

    let stats: Record<string, { rides: number; commission: number }> = {};
    if (driverIds.length > 0) {
      const [rideCounts, commCounts] = await Promise.all([
        prisma.rides_v2.groupBy({ by: ['driver_id'], where: { driver_id: { in: driverIds }, status: 'completed' }, _count: true }),
        prisma.partner_commissions.groupBy({ by: ['driver_id'], where: { partner_id: partnerId, driver_id: { in: driverIds } }, _sum: { commission_amount: true } }),
      ]);
      for (const r of rideCounts) { if (r.driver_id) stats[r.driver_id] = { rides: r._count, commission: 0 }; }
      for (const c of commCounts) { if (c.driver_id) { if (!stats[c.driver_id]) stats[c.driver_id] = { rides: 0, commission: 0 }; stats[c.driver_id].commission = Number(c._sum.commission_amount || 0); } }
    }

    const pending = await prisma.partner_link_requests.count({ where: { partner_id: partnerId, status: 'pending' } });

    res.json({
      success: true,
      data: {
        drivers: drivers.map(d => ({ name: d.name, phone: d.phone, status: d.status, linked_at: d.territorial_partner_linked_at, rides: stats[d.id]?.rides || 0, commission: stats[d.id]?.commission || 0 })),
        pending_requests: pending,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

router.get('/ar-places', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId, userId } = (req as any).partnerUser;
    const rows = await listPartnerOwnedHotelArPlaces({ partnerId, userId });
    return res.json({ success: true, data: rows.map(serializePartnerArPlace) });
  } catch (error) {
    return arPlaceServiceError(res, error, 'Erro ao listar locais AR');
  }
});

router.get('/ar-places/:id', authenticatePartner, async (req: Request, res: Response) => {
  const parsed = arPlaceIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'id inválido' });
  }

  try {
    const { partnerId, userId } = (req as any).partnerUser;
    const row = await getPartnerOwnedHotelArPlaceById(parsed.data.id, { partnerId, userId });
    return res.json({ success: true, data: serializePartnerArPlace(row) });
  } catch (error) {
    return arPlaceServiceError(res, error, 'Erro ao carregar local AR');
  }
});

router.put('/ar-places/:id/change-request', authenticatePartner, async (req: Request, res: Response) => {
  const parsedParams = arPlaceIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: parsedParams.error.issues[0]?.message || 'id inválido' });
  }

  const parsedBody = partnerArPlaceChangeRequestBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ success: false, error: parsedBody.error.issues[0]?.message || 'Payload inválido' });
  }

  try {
    const { partnerId, userId } = (req as any).partnerUser;
    const row = await upsertPartnerOwnedHotelArPlaceChangeRequest(parsedParams.data.id, parsedBody.data, { partnerId, userId });
    return res.json({ success: true, data: serializeArPlaceChangeRequest(row) });
  } catch (error) {
    return arPlaceServiceError(res, error, 'Erro ao salvar alteração pendente');
  }
});

// Members CRUD
router.get('/members', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const members = await prisma.partner_members.findMany({ where: { partner_id: partnerId }, orderBy: { name: 'asc' } });
    res.json({ success: true, data: members });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

router.post('/members', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const { name, unit } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nome obrigatório' });
    const member = await prisma.partner_members.create({ data: { partner_id: partnerId, name, unit: unit || null } });
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

router.patch('/members/:id', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const member = await prisma.partner_members.findUnique({ where: { id: req.params.id } });
    if (!member || member.partner_id !== partnerId) return res.status(404).json({ success: false, error: 'Não encontrado' });
    const { name, unit, status } = req.body;
    const updated = await prisma.partner_members.update({ where: { id: req.params.id }, data: { ...(name && { name }), ...(unit !== undefined && { unit }), ...(status && { status }) } });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

// Transactions + mensalidade summary
router.get('/transactions', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const { reference_month } = req.query;
    const month = (reference_month as string) || new Date().toISOString().slice(0, 7);
    const where: any = { partner_id: partnerId, reference_month: month };
    const transactions = await prisma.partner_transactions.findMany({ where, orderBy: { created_at: 'desc' }, take: 200 });

    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_cents, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0);

    // Mensalidade status per member
    const members = await prisma.partner_members.findMany({ where: { partner_id: partnerId, status: 'active' }, orderBy: { name: 'asc' } });
    const paidMemberIds = new Set(
      transactions.filter(t => t.type === 'income' && t.category === 'mensalidade' && t.member_id).map(t => t.member_id)
    );
    const mensalidade = members.map(m => ({ id: m.id, name: m.name, unit: m.unit, paid: paidMemberIds.has(m.id) }));

    res.json({
      success: true,
      data: {
        transactions,
        income_total: income,
        expense_total: expense,
        balance: income - expense,
        members_active: members.length,
        members_paid: paidMemberIds.size,
        members_overdue: members.length - paidMemberIds.size,
        mensalidade,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

router.post('/transactions', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const { type, amount_cents, description, category, reference_month, member_id } = req.body;
    if (!type || !amount_cents || !description) return res.status(400).json({ success: false, error: 'type, amount_cents e description obrigatórios' });
    const tx = await prisma.partner_transactions.create({ data: { partner_id: partnerId, type, amount_cents: Number(amount_cents), description, category: category || 'outro', reference_month: reference_month || null, member_id: member_id || null } });
    res.status(201).json({ success: true, data: tx });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

router.delete('/transactions/:id', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const tx = await prisma.partner_transactions.findUnique({ where: { id: req.params.id } });
    if (!tx || tx.partner_id !== partnerId) return res.status(404).json({ success: false, error: 'Não encontrado' });
    await prisma.partner_transactions.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

// --- Member Payments (mensalidade) ---

function generateReceiptCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KAV-';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Register payment
router.post('/member-payments', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId, userId } = (req as any).partnerUser;
    const { member_id, reference_month, amount_cents, payment_method, paid_at, notes } = req.body;
    if (!member_id || !reference_month || !amount_cents) return res.status(400).json({ success: false, error: 'member_id, reference_month e amount_cents obrigatórios' });

    const member = await prisma.partner_members.findUnique({ where: { id: member_id } });
    if (!member || member.partner_id !== partnerId) return res.status(404).json({ success: false, error: 'Associado não encontrado' });

    const payment = await prisma.partner_member_payments.create({
      data: {
        partner_id: partnerId,
        member_id,
        reference_month,
        amount_cents: Number(amount_cents),
        payment_method: payment_method || 'pix',
        paid_at: paid_at ? new Date(paid_at) : new Date(),
        receipt_code: generateReceiptCode(),
        notes: notes || null,
        registered_by: userId,
      },
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao registrar pagamento' });
  }
});

// List payments for a month
router.get('/member-payments', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const payments = await prisma.partner_member_payments.findMany({
      where: { partner_id: partnerId, reference_month: month },
      include: { member: { select: { name: true, unit: true } } },
      orderBy: { paid_at: 'desc' },
    });
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro' });
  }
});

// Send receipt via WhatsApp
router.post('/member-payments/:id/send-whatsapp', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const payment = await prisma.partner_member_payments.findUnique({
      where: { id: req.params.id },
      include: { member: { select: { name: true } }, partner: { select: { name: true, responsible_phone: true } } },
    });
    if (!payment || payment.partner_id !== partnerId) return res.status(404).json({ success: false, error: 'Não encontrado' });

    const phone = req.body.phone as string;
    if (!phone) return res.status(400).json({ success: false, error: 'Informe o telefone do associado' });

    const phoneDigits = phone.replace(/\D/g, '');
    const phoneE164 = phoneDigits.startsWith('55') ? `+${phoneDigits}` : `+55${phoneDigits}`;
    const valor = (payment.amount_cents / 100).toFixed(2).replace('.', ',');
    const [year, monthNum] = payment.reference_month.split('-');
    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mesRef = `${meses[Number(monthNum)]}/${year}`;

    const msg = `✅ *Comprovante de Pagamento*\n\n*${payment.partner.name}*\n\nAssociado: ${payment.member.name}\nReferência: ${mesRef}\nValor: R$ ${valor}\nForma: ${payment.payment_method}\nData: ${new Date(payment.paid_at).toLocaleDateString('pt-BR')}\nStatus: Pago ✓\n\nCódigo: ${payment.receipt_code}\n\n🔗 Verificar: kaviar.com.br/comprovante/${payment.receipt_code}\n\n_Seu pagamento ajuda a melhorar o local em que moramos. Obrigado!_`;

    // Send via WhatsApp API (wa.me link for now, template in future)
    try {
      await whatsappEvents.authVerificationCode(phoneE164, { '1': `Comprovante ${payment.receipt_code}` });
    } catch {
      // Fallback: return message for manual send
    }

    await prisma.partner_member_payments.update({ where: { id: req.params.id }, data: { whatsapp_sent_at: new Date() } });

    res.json({ success: true, data: { message: msg, phone: phoneE164 } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao enviar comprovante' });
  }
});

// Generate PDF receipt
router.get('/member-payments/:id/pdf', authenticatePartner, async (req: Request, res: Response) => {
  try {
    const { partnerId } = (req as any).partnerUser;
    const payment = await prisma.partner_member_payments.findUnique({
      where: { id: req.params.id },
      include: { member: { select: { name: true, unit: true } }, partner: { select: { name: true, logo_url: true, address: true } } },
    });
    if (!payment || payment.partner_id !== partnerId) return res.status(404).end();

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename=comprovante-${payment.receipt_code}.pdf`);
    doc.pipe(res);

    // Try to load partner logo
    let logoLoaded = false;
    if (payment.partner.logo_url) {
      try {
        const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
        const s3 = new S3Client({ region: 'us-east-2' });
        const list: any = await s3.send(new ListObjectsV2Command({ Bucket: 'kaviar-uploads-847895361928', Prefix: `partner-logos/${partnerId}`, MaxKeys: 5 }));
        const key = list.Contents?.sort((a: any, b: any) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime())?.[0]?.Key;
        if (key) {
          const obj = await s3.send(new GetObjectCommand({ Bucket: 'kaviar-uploads-847895361928', Key: key }));
          const chunks: Buffer[] = [];
          for await (const chunk of obj.Body) chunks.push(chunk);
          const imgBuffer = Buffer.concat(chunks);
          doc.image(imgBuffer, 50, 40, { width: 60 });
          logoLoaded = true;
        }
      } catch {}
    }

    // Header
    const headerX = logoLoaded ? 120 : 50;
    doc.fontSize(20).font('Helvetica-Bold').text('KAVIAR', headerX, 45, { continued: false });
    doc.fontSize(8).font('Helvetica').text('Mobilidade local brasileira', headerX, 68);
    doc.fontSize(14).font('Helvetica-Bold').text(payment.partner.name, headerX, 85);
    if (payment.partner.address) doc.fontSize(8).font('Helvetica').text(payment.partner.address, headerX, 103);

    // Divider
    doc.moveTo(50, 125).lineTo(545, 125).stroke('#B8942E');

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text('Comprovante de Pagamento', 50, 145, { align: 'center' });

    // Payment details
    const [year, monthNum] = payment.reference_month.split('-');
    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mesRef = `${meses[Number(monthNum)]}/${year}`;
    const valor = (payment.amount_cents / 100).toFixed(2).replace('.', ',');

    const startY = 185;
    const fields = [
      ['Associado', `${payment.member.name}${payment.member.unit ? ` (${payment.member.unit})` : ''}`],
      ['Referência', mesRef],
      ['Valor', `R$ ${valor}`],
      ['Forma de pagamento', payment.payment_method],
      ['Data do pagamento', new Date(payment.paid_at).toLocaleDateString('pt-BR')],
      ['Status', 'Pago ✓'],
      ['Código do comprovante', payment.receipt_code],
    ];
    if (payment.notes) fields.push(['Observação', payment.notes]);

    fields.forEach(([label, value], i) => {
      const y = startY + i * 28;
      doc.fontSize(9).font('Helvetica').fillColor('#666').text(label, 50, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text(value as string, 50, y + 12);
    });

    // Footer
    const footerY = startY + fields.length * 28 + 30;
    doc.moveTo(50, footerY).lineTo(545, footerY).stroke('#E8E5DE');
    doc.fontSize(9).font('Helvetica').fillColor('#888').text('Seu pagamento ajuda a melhorar o local em que moramos. Obrigado!', 50, footerY + 15, { align: 'center' });
    doc.fontSize(7).fillColor('#aaa').text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} • KAVIAR`, 50, footerY + 35, { align: 'center' });
    doc.fontSize(7).text('Controle interno. Não substitui contabilidade oficial.', 50, footerY + 48, { align: 'center' });

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar PDF' });
  }
});

export default router;
