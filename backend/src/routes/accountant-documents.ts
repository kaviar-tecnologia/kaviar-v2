import { Router, Request, Response } from 'express';
import { PrismaClient, accounting_document_scan_status } from '@prisma/client';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import {
  createCompanyDocumentSchema,
  updateCompanyDocumentSchema,
  listCompanyDocumentsQuerySchema,
  VALID_STATUS_TRANSITIONS,
  paginationSchema,
} from '../services/accounting/accounting-documents-validation';
import {
  verifyEntityAccess,
  getAccessibleEntityIds,
  getNextVersionNumber,
} from '../services/accounting/accounting-documents.service';
import {
  requireAccountingAccess,
  handleAccessError,
  scopeForDocumentCategory,
  getActiveLinksForAccountant,
  getAllowedDocumentCategories,
} from '../services/accounting/accounting-access.service';
import {
  validateFileMetadata,
  generateStorageKey,
  generatePresignedGetUrl,
  getFileExtension,
  MAX_VERSIONS_PER_DOCUMENT,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
} from '../services/accounting/accounting-document-storage.service';
import {
  serializeCompanyDocument,
  serializeDocumentFile,
  serializeDocumentType,
} from '../services/accounting/accounting-documents-serializers';

const prisma = new PrismaClient();
const router = Router();

const BUCKET = process.env.S3_UPLOADS_BUCKET || 'kaviar-uploads-847895361928';
const REGION = process.env.AWS_REGION || 'us-east-2';
const s3Client = new S3Client({ region: REGION });

// ============================================================
// DOCUMENT TYPES (read-only for accountants)
// ============================================================

router.get('/document-types', async (req: Request, res: Response) => {
  try {
    const query = paginationSchema.extend({
      category: listCompanyDocumentsQuerySchema.shape.category,
    }).parse(req.query);

    const where: any = { is_active: true };
    if (query.category) where.category = query.category;

    const [types, total] = await Promise.all([
      prisma.accounting_document_types.findMany({
        where,
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.accounting_document_types.count({ where }),
    ]);

    res.json({
      success: true,
      data: types.map(serializeDocumentType),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Parâmetros inválidos', details: err.errors });
    console.error('[document-types] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============================================================
// COMPANY DOCUMENTS
// ============================================================

router.get('/documents', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const query = listCompanyDocumentsQuerySchema.parse(req.query);

    // Get links with scope info to build scoped filter
    const links = await getActiveLinksForAccountant(accountant.id);
    if (links.length === 0 || !links.some(l => l.can_view)) {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: query.limit, total: 0, totalPages: 0 } });
    }

    // Build accessible entity IDs (with children inheritance)
    const accessibleIds = await getAccessibleEntityIds(accountant.id);
    if (accessibleIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: query.limit, total: 0, totalPages: 0 } });
    }

    let entityFilter = accessibleIds;
    if (query.legal_entity_id) {
      if (!accessibleIds.includes(query.legal_entity_id)) {
        return res.status(403).json({ success: false, error: 'Acesso negado à empresa' });
      }
      entityFilter = [query.legal_entity_id];
    }

    // Determine allowed categories based on scope
    // If any link is COMPLETO, all categories are allowed
    const hasCompleto = links.some(l => l.scope === 'COMPLETO' && l.can_view);
    let allowedCategories: string[] | null = null;
    if (!hasCompleto) {
      const categorySet = new Set<string>();
      for (const link of links) {
        if (!link.can_view) continue;
        const cats = getAllowedDocumentCategories(link.scope);
        if (cats) cats.forEach(c => categorySet.add(c));
      }
      allowedCategories = [...categorySet];
      if (allowedCategories.length === 0) {
        return res.json({ success: true, data: [], pagination: { page: 1, limit: query.limit, total: 0, totalPages: 0 } });
      }
    }

    const where: any = { legal_entity_id: { in: entityFilter } };
    if (query.document_type_id) where.document_type_id = query.document_type_id;
    if (query.status) where.status = query.status;

    // Apply category filter: user-requested category intersected with allowed
    if (query.category && allowedCategories) {
      if (!allowedCategories.includes(query.category)) {
        return res.json({ success: true, data: [], pagination: { page: 1, limit: query.limit, total: 0, totalPages: 0 } });
      }
      where.document_type = { category: query.category };
    } else if (query.category) {
      where.document_type = { category: query.category };
    } else if (allowedCategories) {
      where.document_type = { category: { in: allowedCategories } };
    }

    const [docs, total] = await Promise.all([
      prisma.accounting_company_documents.findMany({
        where,
        include: {
          document_type: { select: { code: true, name: true, category: true, renewal_alert_days: true } },
          legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
          _count: { select: { files: true } },
        },
        orderBy: [{ updated_at: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.accounting_company_documents.count({ where }),
    ]);

    let serialized = docs.map(doc => serializeCompanyDocument(doc));
    if (query.temporal_status) {
      serialized = serialized.filter(d => d.temporal_status === query.temporal_status);
    }

    res.json({
      success: true,
      data: serialized,
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Parâmetros inválidos', details: err.errors });
    console.error('[documents] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const doc = await prisma.accounting_company_documents.findUnique({
      where: { id: req.params.id },
      include: {
        document_type: { select: { code: true, name: true, category: true, renewal_alert_days: true } },
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        files: { orderBy: { version_number: 'desc' } },
        _count: { select: { files: true } },
      },
    });

    if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    const requiredScope = scopeForDocumentCategory(doc.document_type?.category);
    await requireAccountingAccess(accountant.id, doc.legal_entity_id, {
      scope: requiredScope,
      permission: 'can_view',
    });

    const currentFile = doc.files.find(f => f.scan_status !== accounting_document_scan_status.INFECTED);

    const result = {
      ...serializeCompanyDocument({ ...doc, _currentFile: currentFile }),
      files: doc.files.map(serializeDocumentFile),
    };

    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    console.error('[documents] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/documents', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = createCompanyDocumentSchema.parse(req.body);

    // Look up document type to determine scope
    const docType = await prisma.accounting_document_types.findUnique({
      where: { id: data.document_type_id },
      select: { id: true, is_active: true, category: true },
    });
    if (!docType || !docType.is_active) {
      return res.status(400).json({ success: false, error: 'Tipo de documento inválido ou inativo' });
    }

    const requiredScope = scopeForDocumentCategory(docType.category);
    await requireAccountingAccess(accountant.id, data.legal_entity_id, {
      scope: requiredScope,
      permission: 'can_upload',
    });

    const doc = await prisma.accounting_company_documents.create({
      data: {
        legal_entity_id: data.legal_entity_id,
        document_type_id: data.document_type_id,
        status: 'DRAFT',
        issued_at: data.issued_at,
        valid_from: data.valid_from,
        expires_at: data.expires_at,
        reference_number: data.reference_number,
        notes: data.notes,
        created_by_id: accountant.id,
        created_by_type: 'ACCOUNTANT',
      },
      include: {
        document_type: { select: { code: true, name: true, category: true, renewal_alert_days: true } },
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
      },
    });

    res.status(201).json({ success: true, data: serializeCompanyDocument(doc) });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[documents] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/documents/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = updateCompanyDocumentSchema.parse(req.body);

    const doc = await prisma.accounting_company_documents.findUnique({
      where: { id: req.params.id },
      include: { document_type: { select: { category: true } } },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    const requiredScope = scopeForDocumentCategory(doc.document_type?.category);
    await requireAccountingAccess(accountant.id, doc.legal_entity_id, {
      scope: requiredScope,
      permission: 'can_upload',
    });

    if (data.status && data.status !== doc.status) {
      const allowed = VALID_STATUS_TRANSITIONS[doc.status] || [];
      if (!allowed.includes(data.status)) {
        return res.status(400).json({
          success: false,
          error: `Transição de status inválida: ${doc.status} → ${data.status}. Permitidas: ${allowed.join(', ') || 'nenhuma'}`,
        });
      }
    }

    const updated = await prisma.accounting_company_documents.update({
      where: { id: req.params.id },
      data: { ...data, updated_by_id: accountant.id },
      include: {
        document_type: { select: { code: true, name: true, category: true, renewal_alert_days: true } },
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
      },
    });

    res.json({ success: true, data: serializeCompanyDocument(updated) });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[documents] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============================================================
// FILE UPLOAD (multipart — streams directly to S3, no CORS needed)
// ============================================================

/**
 * POST /documents/upload?document_id=xxx
 * Upload file directly via multipart form.
 * File streams to S3 via multer-s3. No presigned URL, no CORS.
 */
router.post('/documents/upload', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const documentId = req.query.document_id as string;
    if (!documentId) {
      return res.status(400).json({ success: false, error: 'document_id é obrigatório (query param)' });
    }

    // Verify document
    const doc = await prisma.accounting_company_documents.findUnique({
      where: { id: documentId },
      include: { document_type: { select: { category: true } } },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    // Scope + permission
    const requiredScope = scopeForDocumentCategory(doc.document_type?.category);
    await requireAccountingAccess(accountant.id, doc.legal_entity_id, {
      scope: requiredScope,
      permission: 'can_upload',
    });

    // Version limit
    const existingCount = await prisma.accounting_company_document_files.count({ where: { document_id: documentId } });
    if (existingCount >= MAX_VERSIONS_PER_DOCUMENT) {
      return res.status(400).json({ success: false, error: `Limite de ${MAX_VERSIONS_PER_DOCUMENT} versões atingido` });
    }

    // Get next version
    let versionNumber = await getNextVersionNumber(documentId);
    let storageKey = '';

    // Configure multer-s3 for this specific upload
    const upload = multer({
      storage: multerS3({
        s3: s3Client,
        bucket: BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (_r: any, file: Express.Multer.File, cb: any) => {
          cb(null, { originalname: file.originalname });
        },
        key: (_r: any, file: Express.Multer.File, cb: any) => {
          const ext = getFileExtension(file.originalname);
          storageKey = generateStorageKey(documentId, versionNumber, ext);
          cb(null, storageKey);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_r: any, file: Express.Multer.File, cb: any) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
        }
        const ext = getFileExtension(file.originalname);
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return cb(new Error(`Extensão não permitida: ${ext}`));
        }
        cb(null, true);
      },
    }).single('file');

    // Execute upload
    await new Promise<void>((resolve, reject) => {
      upload(req, res, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const uploadedFile = (req as any).file;
    if (!uploadedFile) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }

    // SHA-256 placeholder (file was streamed, no buffer available)
    const sha256 = crypto.createHash('sha256')
      .update(`${storageKey}:${uploadedFile.size}:${Date.now()}`)
      .digest('hex');

    // Create DB record with retry for version collision
    let dbFile: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        dbFile = await prisma.accounting_company_document_files.create({
          data: {
            document_id: documentId,
            version_number: versionNumber,
            original_filename: uploadedFile.originalname,
            storage_key: storageKey,
            mime_type: uploadedFile.mimetype,
            size_bytes: uploadedFile.size,
            sha256,
            uploaded_by_accountant_id: accountant.id,
            scan_status: accounting_document_scan_status.NOT_SCANNED,
            replacement_reason: (req.body?.replacement_reason as string) || null,
          },
        });
        break;
      } catch (err: any) {
        if (err.code === 'P2002' && attempt < 2) {
          versionNumber = await getNextVersionNumber(documentId);
          continue;
        }
        throw err;
      }
    }

    if (!dbFile) {
      return res.status(409).json({ success: false, error: 'Conflito de versão' });
    }

    // Audit
    console.info('[documents:upload:audit]', JSON.stringify({
      action: 'UPLOAD_COMPLETED',
      accountant_id: accountant.id,
      document_id: documentId,
      legal_entity_id: doc.legal_entity_id,
      file_id: dbFile.id,
      version_number: dbFile.version_number,
      filename: uploadedFile.originalname,
      size_bytes: uploadedFile.size,
      mime_type: uploadedFile.mimetype,
      client_ip: clientIp,
      user_agent: userAgent,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json({ success: true, data: serializeDocumentFile(dbFile) });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    if (err.message?.includes('não permitid')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: `Arquivo excede o limite de ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }
    console.error('[documents] upload error:', err);
    res.status(500).json({ success: false, error: 'Erro interno no upload' });
  }
});

// ============================================================
// FILE DOWNLOAD
// ============================================================

router.get('/documents/:documentId/files/:fileId/download', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { documentId, fileId } = req.params;
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const file = await prisma.accounting_company_document_files.findFirst({
      where: { id: fileId, document_id: documentId },
      include: {
        document: {
          include: { document_type: { select: { category: true } } },
        },
      },
    });
    if (!file) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    const requiredScope = scopeForDocumentCategory(file.document?.document_type?.category);
    await requireAccountingAccess(accountant.id, file.document.legal_entity_id, {
      scope: requiredScope,
      permission: 'can_download',
    });

    if (file.scan_status === accounting_document_scan_status.INFECTED) {
      return res.status(403).json({ success: false, error: 'Download bloqueado: arquivo marcado como infectado' });
    }

    const { downloadUrl, expiresInSeconds } = await generatePresignedGetUrl({
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
    });

    console.info('[documents:download:audit]', JSON.stringify({
      action: 'DOWNLOAD_REQUESTED',
      accountant_id: accountant.id,
      document_id: documentId,
      file_id: file.id,
      client_ip: clientIp,
      user_agent: userAgent,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      success: true,
      data: { download_url: downloadUrl, expires_in_seconds: expiresInSeconds, filename: file.original_filename, mime_type: file.mime_type, size_bytes: file.size_bytes },
    });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    console.error('[documents] download error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/documents/:documentId/files', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { documentId } = req.params;

    const doc = await prisma.accounting_company_documents.findUnique({
      where: { id: documentId },
      include: { document_type: { select: { category: true } } },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    const requiredScope = scopeForDocumentCategory(doc.document_type?.category);
    await requireAccountingAccess(accountant.id, doc.legal_entity_id, {
      scope: requiredScope,
      permission: 'can_view',
    });

    const files = await prisma.accounting_company_document_files.findMany({
      where: { document_id: documentId },
      orderBy: { version_number: 'desc' },
    });

    res.json({ success: true, data: files.map(serializeDocumentFile) });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    console.error('[documents] list files error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const accountantDocumentRoutes = router;
export default router;
