import { Router, Request, Response } from 'express';
import { PrismaClient, accounting_document_scan_status } from '@prisma/client';
import {
  createCompanyDocumentSchema,
  updateCompanyDocumentSchema,
  listCompanyDocumentsQuerySchema,
  requestUploadSchema,
  confirmUploadSchema,
  VALID_STATUS_TRANSITIONS,
  paginationSchema,
} from '../services/accounting/accounting-documents-validation';
import {
  verifyEntityAccess,
  getAccessibleEntityIds,
  getCurrentFile,
  getNextVersionNumber,
  computeTemporalStatus,
} from '../services/accounting/accounting-documents.service';
import {
  validateFileMetadata,
  generateStorageKey,
  generatePresignedPutUrl,
  generatePresignedGetUrl,
  verifyUpload,
  getFileExtension,
  MAX_VERSIONS_PER_DOCUMENT,
} from '../services/accounting/accounting-document-storage.service';
import {
  serializeCompanyDocument,
  serializeDocumentFile,
  serializeUploadResponse,
  serializeDocumentType,
} from '../services/accounting/accounting-documents-serializers';

const prisma = new PrismaClient();
const router = Router();

// ============================================================
// DOCUMENT TYPES (read-only for accountants)
// ============================================================

/**
 * GET /document-types
 * List active document types (catalog).
 */
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

/**
 * GET /documents
 * List documents for all accessible companies.
 */
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const query = listCompanyDocumentsQuerySchema.parse(req.query);

    // Get accessible entity IDs
    const accessibleIds = await getAccessibleEntityIds(accountant.id);
    if (accessibleIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: query.limit, total: 0, totalPages: 0 } });
    }

    // If specific entity requested, verify access
    let entityFilter = accessibleIds;
    if (query.legal_entity_id) {
      if (!accessibleIds.includes(query.legal_entity_id)) {
        return res.status(403).json({ success: false, error: 'Acesso negado à empresa' });
      }
      entityFilter = [query.legal_entity_id];
    }

    const where: any = { legal_entity_id: { in: entityFilter } };
    if (query.document_type_id) where.document_type_id = query.document_type_id;
    if (query.status) where.status = query.status;
    if (query.category) where.document_type = { category: query.category };

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

    // Post-filter by temporal_status if requested
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

/**
 * GET /documents/:id
 * Get document detail with current file.
 */
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

    // Scope validation
    const link = await verifyEntityAccess(accountant.id, doc.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    // Derive current file (exclude INFECTED)
    const currentFile = doc.files.find(f => f.scan_status !== accounting_document_scan_status.INFECTED);

    const result = {
      ...serializeCompanyDocument({ ...doc, _currentFile: currentFile }),
      files: doc.files.map(serializeDocumentFile),
    };

    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[documents] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /documents
 * Create a new document (DRAFT status).
 */
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = createCompanyDocumentSchema.parse(req.body);

    // Scope validation
    const link = await verifyEntityAccess(accountant.id, data.legal_entity_id);
    if (!link) return res.status(403).json({ success: false, error: 'Acesso negado à empresa' });

    // Verify document type exists and is active
    const docType = await prisma.accounting_document_types.findUnique({
      where: { id: data.document_type_id },
      select: { id: true, is_active: true },
    });
    if (!docType || !docType.is_active) {
      return res.status(400).json({ success: false, error: 'Tipo de documento inválido ou inativo' });
    }

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
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[documents] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * PATCH /documents/:id
 * Update document metadata or transition status.
 */
router.patch('/documents/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = updateCompanyDocumentSchema.parse(req.body);

    const doc = await prisma.accounting_company_documents.findUnique({
      where: { id: req.params.id },
      select: { id: true, legal_entity_id: true, status: true },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    // Scope validation
    const link = await verifyEntityAccess(accountant.id, doc.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    // Validate status transition if changing status
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
      data: {
        ...data,
        updated_by_id: accountant.id,
      },
      include: {
        document_type: { select: { code: true, name: true, category: true, renewal_alert_days: true } },
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
      },
    });

    res.json({ success: true, data: serializeCompanyDocument(updated) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[documents] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============================================================
// FILE UPLOAD
// ============================================================

/**
 * POST /documents/upload
 * Request a presigned PUT URL for file upload.
 *
 * SECURITY:
 * - Validates scope, permission (can_upload), MIME, extension, size
 * - Version number allocated atomically via UNIQUE constraint + retry
 * - Storage key is server-generated, immutable, never client-influenced
 * - Presigned URL bound to exact key + content-type + content-length
 * - URL expires in 5 minutes
 * - Concurrent uploads: UNIQUE(document_id, version_number) prevents collision;
 *   on conflict, retry with next version (max 3 retries)
 *
 * AUDIT:
 * - Records: who, when, document, version, IP, User-Agent
 */
router.post('/documents/upload', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = requestUploadSchema.parse(req.body);

    // Capture audit context
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Validate file metadata
    const validation = validateFileMetadata({
      filename: data.filename,
      mimeType: data.mime_type,
      sizeBytes: data.size_bytes,
    });
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Verify document exists
    const doc = await prisma.accounting_company_documents.findUnique({
      where: { id: data.document_id },
      select: { id: true, legal_entity_id: true, status: true },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    // Scope validation
    const link = await verifyEntityAccess(accountant.id, doc.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    // Check permission: can_upload
    if (!link.can_upload) {
      return res.status(403).json({ success: false, error: 'Sem permissão de upload para esta empresa' });
    }

    // Check version limit
    const existingVersionCount = await prisma.accounting_company_document_files.count({
      where: { document_id: data.document_id },
    });
    if (existingVersionCount >= MAX_VERSIONS_PER_DOCUMENT) {
      return res.status(400).json({
        success: false,
        error: `Limite de ${MAX_VERSIONS_PER_DOCUMENT} versões por documento atingido`,
      });
    }

    // Allocate version with concurrency-safe retry (UNIQUE constraint protects)
    const MAX_RETRIES = 3;
    let file: any = null;
    let storageKey = '';

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const versionNumber = await getNextVersionNumber(data.document_id);
      const extension = getFileExtension(data.filename);
      storageKey = generateStorageKey(data.document_id, versionNumber, extension);

      try {
        file = await prisma.accounting_company_document_files.create({
          data: {
            document_id: data.document_id,
            version_number: versionNumber,
            original_filename: data.filename,
            storage_key: storageKey,
            mime_type: data.mime_type,
            size_bytes: data.size_bytes,
            sha256: data.sha256,
            uploaded_by_accountant_id: accountant.id,
            scan_status: accounting_document_scan_status.NOT_SCANNED,
            replacement_reason: data.replacement_reason,
          },
        });
        break; // success
      } catch (err: any) {
        if (err.code === 'P2002' && attempt < MAX_RETRIES - 1) {
          // Version collision — another concurrent upload took this version. Retry.
          continue;
        }
        throw err; // non-retryable error
      }
    }

    if (!file) {
      return res.status(409).json({ success: false, error: 'Conflito de versão após múltiplas tentativas' });
    }

    // Generate presigned PUT URL
    const { uploadUrl, expiresInSeconds } = await generatePresignedPutUrl({
      storageKey,
      mimeType: data.mime_type,
      sizeBytes: data.size_bytes,
      sha256: data.sha256,
    });

    // Audit log (async, non-blocking)
    console.info('[documents:upload:audit]', JSON.stringify({
      action: 'UPLOAD_REQUESTED',
      accountant_id: accountant.id,
      document_id: data.document_id,
      legal_entity_id: doc.legal_entity_id,
      file_id: file.id,
      version_number: file.version_number,
      filename: data.filename,
      size_bytes: data.size_bytes,
      mime_type: data.mime_type,
      sha256: data.sha256,
      client_ip: clientIp,
      user_agent: userAgent,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json({
      success: true,
      data: serializeUploadResponse(file, uploadUrl, expiresInSeconds),
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Conflito: versão ou chave de armazenamento duplicada' });
    }
    console.error('[documents] upload request error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /documents/upload/confirm
 * Confirm that the upload completed successfully.
 *
 * VERIFICATION:
 * - File exists in S3 (HeadObject)
 * - ContentLength matches declared size
 * - ContentType matches declared MIME type
 * - Returns ETag for client-side verification
 *
 * RETRY SAFETY:
 * - Idempotent: calling confirm multiple times is safe
 * - If upload failed (object doesn't exist), returns error
 * - Client can request a new presigned URL for the same file record
 *
 * SHA-256 NOTE:
 * - Backend stores the client-declared SHA-256 but CANNOT verify it without
 *   downloading the full file content from S3
 * - S3's ETag (MD5) is a separate integrity check
 * - True SHA-256 verification requires a background job or S3 Object Lambda
 * - This is documented honestly as a declared (not verified) hash
 */
router.post('/documents/upload/confirm', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { file_id } = confirmUploadSchema.parse(req.body);

    // Capture audit context
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Find the file
    const file = await prisma.accounting_company_document_files.findUnique({
      where: { id: file_id },
      include: { document: { select: { id: true, legal_entity_id: true } } },
    });
    if (!file) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    // Verify the accountant owns this upload
    if (file.uploaded_by_accountant_id !== accountant.id) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Verify file exists in S3 with full validation
    const verification = await verifyUpload(file.storage_key, file.size_bytes, file.mime_type);

    if (!verification.exists) {
      return res.status(400).json({
        success: false,
        error: 'Upload não encontrado no storage. O link pode ter expirado. Solicite novo upload.',
      });
    }

    if (!verification.sizeMatch) {
      return res.status(400).json({
        success: false,
        error: `Tamanho divergente: esperado ${file.size_bytes} bytes, encontrado ${verification.actualSize} bytes`,
      });
    }

    if (!verification.contentTypeMatch) {
      // Log but don't reject — S3 sometimes normalizes content types
      console.warn('[documents:upload:confirm] ContentType mismatch:', {
        file_id: file.id,
        expected: file.mime_type,
        actual: verification.actualContentType,
      });
    }

    // Audit log
    console.info('[documents:upload:audit]', JSON.stringify({
      action: 'UPLOAD_CONFIRMED',
      accountant_id: accountant.id,
      document_id: file.document.id,
      legal_entity_id: file.document.legal_entity_id,
      file_id: file.id,
      version_number: file.version_number,
      etag: verification.etag,
      size_verified: verification.sizeMatch,
      content_type_verified: verification.contentTypeMatch,
      client_ip: clientIp,
      user_agent: userAgent,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      success: true,
      data: {
        confirmed: true,
        file: serializeDocumentFile(file),
        verification: {
          size_match: verification.sizeMatch,
          content_type_match: verification.contentTypeMatch,
          etag: verification.etag,
        },
        sha256_note: 'SHA-256 é declarado pelo cliente. Verificação real requer processo assíncrono.',
      },
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[documents] upload confirm error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============================================================
// FILE DOWNLOAD
// ============================================================

/**
 * GET /documents/:documentId/files/:fileId/download
 * Generate presigned GET URL for secure download.
 *
 * SECURITY CHAIN (all validated BEFORE URL generation):
 * 1. Authenticated accountant (JWT middleware)
 * 2. File belongs to document
 * 3. Accountant has active link to entity (scope)
 * 4. Link has can_download permission
 * 5. File scan_status is not INFECTED
 *
 * Only after ALL checks pass is the presigned URL generated.
 */
router.get('/documents/:documentId/files/:fileId/download', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { documentId, fileId } = req.params;

    // Capture audit context
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Find the file — must belong to the specified document
    const file = await prisma.accounting_company_document_files.findFirst({
      where: { id: fileId, document_id: documentId },
      include: { document: { select: { id: true, legal_entity_id: true } } },
    });
    if (!file) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    // Scope validation: accountant must have access to the entity
    const link = await verifyEntityAccess(accountant.id, file.document.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    // Permission check: can_download
    if (!link.can_download) {
      return res.status(403).json({ success: false, error: 'Sem permissão de download para esta empresa' });
    }

    // Security check: INFECTED files cannot be downloaded
    if (file.scan_status === accounting_document_scan_status.INFECTED) {
      return res.status(403).json({ success: false, error: 'Download bloqueado: arquivo marcado como infectado' });
    }

    // ALL security checks passed — generate presigned URL
    const { downloadUrl, expiresInSeconds } = await generatePresignedGetUrl({
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
    });

    // Audit log
    console.info('[documents:download:audit]', JSON.stringify({
      action: 'DOWNLOAD_REQUESTED',
      accountant_id: accountant.id,
      document_id: documentId,
      legal_entity_id: file.document.legal_entity_id,
      file_id: file.id,
      version_number: file.version_number,
      client_ip: clientIp,
      user_agent: userAgent,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      success: true,
      data: {
        download_url: downloadUrl,
        expires_in_seconds: expiresInSeconds,
        filename: file.original_filename,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
      },
    });
  } catch (err: any) {
    console.error('[documents] download error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * GET /documents/:documentId/files
 * List all file versions for a document.
 */
router.get('/documents/:documentId/files', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { documentId } = req.params;

    // Verify document exists and scope
    const doc = await prisma.accounting_company_documents.findUnique({
      where: { id: documentId },
      select: { id: true, legal_entity_id: true },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    const link = await verifyEntityAccess(accountant.id, doc.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

    const files = await prisma.accounting_company_document_files.findMany({
      where: { document_id: documentId },
      orderBy: { version_number: 'desc' },
    });

    res.json({ success: true, data: files.map(serializeDocumentFile) });
  } catch (err: any) {
    console.error('[documents] list files error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const accountantDocumentRoutes = router;
export default router;
