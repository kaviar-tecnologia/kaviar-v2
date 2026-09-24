import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { authenticateAdmin } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import { TERRITORIAL_MANAGER_CONTRACT_VERSION } from '../services/contracts/territorial-manager-contract-v1_2';

const router = Router();
router.use(authenticateAdmin);

// GET /api/admin/my-operator-profile
router.get('/', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    let profile = await prisma.operator_profiles.findUnique({
      where: { admin_id: admin.id },
      include: { territory: { select: { id: true, name: true, level: true } } },
    });

    // On-demand: criar profile se TERRITORIAL_OPERATOR ou TERRITORIAL_MANAGER com territory_access
    if (!profile && (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER')) {
      const access = await prisma.admin_territory_access.findFirst({ where: { admin_id: admin.id } });
      if (access) {
        const relationshipType = admin.role === 'TERRITORIAL_MANAGER' ? 'territorial_manager' : 'territorial_operator';
        profile = await prisma.operator_profiles.create({
          data: {
            admin_id: admin.id,
            territory_id: access.territory_id,
            display_name: admin.name || 'Operador Territorial',
            relationship_type: relationshipType,
            recipient_type: 'individual',
            contract_status: 'pending',
            document_status: 'pending',
            is_active: false,
          },
          include: { territory: { select: { id: true, name: true, level: true } } },
        });
      }
    }

    if (!profile) return res.json({ success: true, data: null });
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar perfil' });
  }
});

// GET /api/admin/my-operator-profile/contract-template-url
router.get('/contract-template-url', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const profile = await prisma.operator_profiles.findUnique({
      where: { admin_id: admin.id },
      select: { contract_template_url: true },
    });
    if (!profile) return res.status(404).json({ success: false, error: 'Perfil não encontrado' });
    if (!profile.contract_template_url) return res.status(404).json({ success: false, error: 'Modelo de contrato não disponível' });

    const { getPresignedUrl } = await import('../config/s3-upload');
    const url = await getPresignedUrl(profile.contract_template_url);
    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar URL do modelo' });
  }
});

// POST /api/admin/my-operator-profile/submit-contract — Gestor(a) envia PDF assinado
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const submitContractUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_r: any, file: any, cb: any) => { file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Apenas PDF permitido')); },
}).single('file');

router.post('/submit-contract', (req: Request, res: Response) => {
  submitContractUpload(req, res, async (err: any) => {
    try {
      if (err) return res.status(400).json({ success: false, error: err.message || 'Erro no upload' });

      const admin = (req as any).admin;
      const profile = await prisma.operator_profiles.findUnique({ where: { admin_id: admin.id } });
      if (!profile) return res.status(404).json({ success: false, error: 'Perfil não encontrado' });

      if (!['available', 'rejected'].includes(profile.contract_status)) {
        return res.status(409).json({ success: false, error: `Envio não permitido no estado '${profile.contract_status}'. Permitido: available, rejected.` });
      }

      if (
        profile.relationship_type === 'territorial_manager' &&
        profile.terms_version !== TERRITORIAL_MANAGER_CONTRACT_VERSION
      ) {
        return res.status(409).json({
          success: false,
          error: `Modelo contratual ${TERRITORIAL_MANAGER_CONTRACT_VERSION} precisa ser gerado antes do envio para assinatura.`,
          required_contract_version: TERRITORIAL_MANAGER_CONTRACT_VERSION,
        });
      }

      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: 'Arquivo PDF obrigatório' });

      // SHA-256 do PDF enviado
      const documentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

      // Upload para S3
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
      const bucket = process.env.AWS_S3_BUCKET || 'kaviar-uploads-847895361928';
      const s3Key = `contract-submissions/${profile.id}/${Date.now()}.pdf`;

      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: 'application/pdf' }));

      const now = new Date();
      const submissionContractVersion =
        profile.relationship_type === 'territorial_manager'
          ? TERRITORIAL_MANAGER_CONTRACT_VERSION
          : (profile.terms_version || 'v1.0');
      const signerName =
        profile.recipient_type === 'individual'
          ? (profile.full_name || profile.display_name)
          : (profile.legal_representative_name || profile.display_name);
      const signerDocument =
        profile.recipient_type === 'individual'
          ? profile.document_cpf
          : (profile.legal_representative_cpf || profile.document_cnpj);

      // Supersede previous rejected submissions
      await prisma.contract_submissions.updateMany({
        where: { operator_profile_id: profile.id, status: 'rejected' },
        data: { status: 'superseded', updated_at: now },
      });

      // Create submission with audit trail
      const submission = await prisma.contract_submissions.create({
        data: {
          operator_profile_id: profile.id,
          submitted_by_admin_id: admin.id,
          s3_key: s3Key,
          status: 'submitted',
          signer_name: signerName,
          signer_email: profile.email || admin.email,
          signer_document: signerDocument || null,
          signer_ip: req.ip || req.socket?.remoteAddress || null,
          signer_user_agent: (req.headers['user-agent'] || '').substring(0, 200) || null,
          document_hash: documentHash,
          contract_version: submissionContractVersion,
          submitted_at: now,
        },
      });

      // Update operator_profiles.contract_status
      await prisma.operator_profiles.update({
        where: { admin_id: admin.id },
        data: { contract_status: 'submitted', updated_at: now },
      });

      // Audit log
      audit({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'submit_contract',
        entityType: 'contract_submission',
        entityId: submission.id,
        newValue: { document_hash: documentHash, signer_name: signerName, signer_document: signerDocument || null, s3_key: s3Key, contract_version: submissionContractVersion },
        ipAddress: req.ip || req.socket?.remoteAddress || undefined,
      });

      res.json({ success: true, data: { submitted: true } });
    } catch (error) {
      console.error('[submit-contract] error:', error);
      res.status(500).json({ success: false, error: 'Erro ao enviar contrato' });
    }
  });
});

// GET /api/admin/my-operator-profile/submissions — Histórico de envios
router.get('/submissions', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const profile = await prisma.operator_profiles.findUnique({ where: { admin_id: admin.id }, select: { id: true } });
    if (!profile) return res.status(404).json({ success: false, error: 'Perfil não encontrado' });

    const submissions = await prisma.contract_submissions.findMany({
      where: { operator_profile_id: profile.id },
      select: { id: true, status: true, rejection_reason: true, created_at: true, reviewed_at: true },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    res.json({ success: true, data: submissions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar histórico' });
  }
});

// GET /api/admin/my-operator-profile/contract-url
router.get('/contract-url', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const profile = await prisma.operator_profiles.findUnique({
      where: { admin_id: admin.id },
      select: { contract_url: true },
    });
    if (!profile) return res.status(404).json({ success: false, error: 'Perfil não encontrado' });
    if (!profile.contract_url) return res.status(404).json({ success: false, error: 'Contrato não disponível' });

    const { getPresignedUrl } = await import('../config/s3-upload');
    const url = await getPresignedUrl(profile.contract_url);
    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar URL do contrato' });
  }
});

// POST /api/admin/my-operator-profile/accept-terms
router.post('/accept-terms', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const profile = await prisma.operator_profiles.findUnique({ where: { admin_id: admin.id } });
    if (!profile) return res.status(404).json({ success: false, error: 'Perfil não encontrado' });

    if (profile.terms_accepted_at) {
      return res.json({ success: true, data: { already_accepted: true, accepted_at: profile.terms_accepted_at } });
    }

    const now = new Date();
    const isTerritorialManager = profile.relationship_type === 'territorial_manager';

    const updated = await prisma.operator_profiles.update({
      where: { admin_id: admin.id },
      data: {
        terms_accepted_at: now,
        responsibility_terms_accepted_at: now,
        confidentiality_terms_accepted_at: now,
        terms_accepted_by: admin.id,
        ...(isTerritorialManager
          ? {}
          : { terms_version: 'v1.0-captador', contract_status: 'signed' }),
      },
    });

    res.json({
      success: true,
      data: {
        accepted_at: updated.terms_accepted_at,
        terms_version: updated.terms_version,
        contract_required: isTerritorialManager,
        contract_status: updated.contract_status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao aceitar termos' });
  }
});

// GET /api/admin/my-operator-profile/territory-info
router.get('/territory-info', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const access = await prisma.admin_territory_access.findFirst({ where: { admin_id: admin.id } });
    if (!access) return res.json({ success: true, data: null });

    const territory = await prisma.operational_territories.findUnique({
      where: { id: access.territory_id },
      select: { id: true, name: true, level: true },
    });
    if (!territory) return res.json({ success: true, data: null });

    const neighborhoods = await prisma.neighborhoods.findMany({
      where: { territory_id: territory.id, is_active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: { territory_name: territory.name, neighborhoods: neighborhoods.map(n => n.name) } });
  } catch {
    res.status(500).json({ success: false, error: 'Erro ao buscar território' });
  }
});

export default router;
