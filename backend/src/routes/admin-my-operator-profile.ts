import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { authenticateAdmin } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import { TERRITORIAL_MANAGER_CONTRACT_VERSION } from '../services/contracts/territorial-manager-contract-v1_2';
import { managerRegistrationMissingFields, maskRegistrationCpf, maskRegistrationPix, planManagerSelfRegistration } from '../services/territory/manager-self-registration';

const router = Router();
router.use(authenticateAdmin);


// Cadastro contratual da própria gestora. Não cria acesso, contrato ou direito a repasse.
function canEditManagerRegistration(profile: any): boolean {
  return profile.relationship_type === 'territorial_manager' &&
    profile.recipient_type === 'individual' &&
    profile.document_status === 'pending' &&
    profile.contract_status === 'pending' &&
    profile.is_active === false &&
    !profile.contract_url && !profile.contract_template_url;
}

function ownManagerRegistrationView(profile: any) {
  const missingFields = managerRegistrationMissingFields(profile);
  return {
    fullName: profile.full_name || '',
    email: profile.email || profile.admin.email || '',
    phone: profile.phone || profile.admin.phone || '',
    territory: profile.territory?.name || '',
    address: profile.address || '',
    cpfMasked: maskRegistrationCpf(profile.document_cpf),
    hasCpf: Boolean(profile.document_cpf),
    hasRg: Boolean(profile.document_rg),
    pixMasked: maskRegistrationPix(profile.pix_key),
    pixKeyType: profile.pix_key_type || null,
    hasPix: Boolean(profile.pix_key),
    documentStatus: profile.document_status,
    contractStatus: profile.contract_status,
    readyForReview: missingFields.length === 0,
    missingFields,
    canEdit: canEditManagerRegistration(profile),
  };
}

async function findOwnManagerRegistration(adminId: string) {
  return prisma.operator_profiles.findUnique({
    where: { admin_id: adminId },
    include: {
      admin: { select: { id: true, name: true, email: true, phone: true, role: true, is_active: true } },
      territory: { select: { name: true } },
    },
  });
}

// GET /api/admin/my-operator-profile/registration — apenas dados do próprio perfil.
router.get('/registration', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin.role !== 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Acesso restrito ao Gestor Territorial.' });
    const profile = await findOwnManagerRegistration(admin.id);
    if (!profile || profile.admin.role !== 'TERRITORIAL_MANAGER' || !profile.admin.is_active ||
        profile.relationship_type !== 'territorial_manager' || profile.recipient_type !== 'individual') {
      return res.status(404).json({ success: false, error: 'Cadastro do gestor não encontrado.' });
    }
    return res.json({ success: true, data: ownManagerRegistrationView(profile) });
  } catch {
    return res.status(500).json({ success: false, error: 'Não foi possível consultar seu cadastro.' });
  }
});

// PATCH /api/admin/my-operator-profile/registration — somente CPF, endereço, RG e Pix próprios.
router.patch('/registration', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin.role !== 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Acesso restrito ao Gestor Territorial.' });
    const profile = await findOwnManagerRegistration(admin.id);
    if (!profile || profile.admin.role !== 'TERRITORIAL_MANAGER' || !profile.admin.is_active ||
        profile.relationship_type !== 'territorial_manager' || profile.recipient_type !== 'individual') {
      return res.status(404).json({ success: false, error: 'Cadastro do gestor não encontrado.' });
    }
    if (!canEditManagerRegistration(profile)) {
      return res.status(409).json({ success: false, error: 'Cadastro indisponível para edição. Solicite revisão da central.' });
    }

    const plan = planManagerSelfRegistration(req.body, profile);
    if (!plan.ok) return res.status(400).json({ success: false, error: plan.error });
    if (Object.keys(plan.changes).length === 0) {
      return res.json({ success: true, data: ownManagerRegistrationView(profile) });
    }

    // Concorrência: se o perfil foi revisado, ativado ou recebeu minuta, não sobrescrever.
    const result = await prisma.operator_profiles.updateMany({
      where: {
        id: profile.id,
        admin_id: admin.id,
        updated_at: profile.updated_at,
        relationship_type: 'territorial_manager',
        recipient_type: 'individual',
        document_status: 'pending',
        contract_status: 'pending',
        is_active: false,
        contract_url: null,
        contract_template_url: null,
      },
      data: plan.changes,
    });
    if (result.count !== 1) {
      return res.status(409).json({ success: false, error: 'O cadastro foi alterado. Atualize a página e tente novamente.' });
    }
    const updated = await findOwnManagerRegistration(admin.id);
    if (!updated) return res.status(409).json({ success: false, error: 'Perfil indisponível após atualização.' });
    const ctx = auditCtx(req);
    audit({
      adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'manager_self_registration_submitted',
      entityType: 'operator_profile', entityId: profile.id,
      newValue: { changed_fields: Object.keys(plan.changes), status: 'pending_manual_review' },
      ipAddress: ctx.ip,
    });
    return res.json({ success: true, data: ownManagerRegistrationView(updated) });
  } catch {
    return res.status(500).json({ success: false, error: 'Não foi possível salvar seu cadastro.' });
  }
});

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

    let financialActivation = null;
    if (profile.relationship_type === 'territorial_manager') {
      const now = new Date();
      const assignment = await prisma.territory_manager_assignments.findFirst({
        where: {
          admin_id: admin.id,
          territory_id: profile.territory_id,
          status: 'active',
          started_at: { lte: now },
          OR: [{ ended_at: null }, { ended_at: { gt: now } }],
        },
        select: { id: true, status: true, started_at: true, ended_at: true },
        orderBy: { started_at: 'desc' },
      });
      financialActivation = {
        active: Boolean(assignment),
        assignment_id: assignment?.id || null,
        started_at: assignment?.started_at || null,
        ended_at: assignment?.ended_at || null,
      };
    }

    res.json({ success: true, data: { ...profile, financial_activation: financialActivation } });
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
      if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return res.status(400).json({ success: false, error: 'Arquivo inválido: conteúdo não corresponde a PDF.' });
      }

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

      // SHA-256 do PDF enviado
      const documentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

      // Upload para S3 com metadados probatórios não sensíveis
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
      const bucket = process.env.AWS_S3_BUCKET || 'kaviar-uploads-847895361928';
      const s3Key = `contract-submissions/${profile.id}/${Date.now()}.pdf`;

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: file.buffer,
        ContentType: 'application/pdf',
        Metadata: {
          contract_version: submissionContractVersion,
          document_sha256: documentHash,
          operator_profile_id: profile.id,
        },
      }));

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
      select: { id: true, name: true, level: true, status: true, is_active: true },
    });
    if (!territory) return res.json({ success: true, data: null });

    const neighborhoods = await prisma.neighborhoods.findMany({
      where: { territory_id: territory.id, is_active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: { territory_id: territory.id, territory_name: territory.name, territory_status: territory.status, territory_active: territory.is_active, neighborhoods: neighborhoods.map(n => n.name) } });
  } catch {
    res.status(500).json({ success: false, error: 'Erro ao buscar território' });
  }
});

export default router;
