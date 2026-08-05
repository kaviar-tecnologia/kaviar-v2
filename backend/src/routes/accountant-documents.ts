import { Router, Request, Response } from 'express';
import { PrismaClient, accounting_document_scan_status } from '@prisma/client';
import {
  createCompanyDocumentSchema,
  updateCompanyDocumentSchema,
  listCompanyDocumentsQuerySchema,
  requestUploadSchema,
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

    // Temporal status filter requires post-query filtering
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
 * Flow: Client requests URL → uploads to S3 → calls confirm.
 */
router.post('/documents/upload', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = requestUploadSchema.parse(req.body);

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

    // Get next version
    const versionNumber = await getNextVersionNumber(data.document_id);

    // Generate storage key
    const extension = getFileExtension(data.filename);
    const storageKey = generateStorageKey(data.document_id, versionNumber, extension);

    // Create file record (existence = upload intent registered)
    const file = await prisma.accounting_company_document_files.create({
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

    // Generate presigned PUT URL
    const { uploadUrl, expiresInSeconds } = await generatePresignedPutUrl({
      storageKey,
      mimeType: data.mime_type,
      sizeBytes: data.size_bytes,
      sha256: data.sha256,
    });

    res.status(201).json({
      success: true,
      data: serializeUploadResponse(file, uploadUrl, expiresInSeconds),
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err.code === 'P2002') {
      // Unique constraint violation (storage_key or version_number)
      return res.status(409).json({ success: false, error: 'Conflito: versão ou chave de armazenamento duplicada' });
    }
    console.error('[documents] upload request error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /documents/upload/confirm
 * Confirm that the upload completed successfully.
 * Verifies file exists in S3 and size matches.
 */
router.post('/documents/upload/confirm', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { file_id } = requestUploadSchema.pick({ document_id: true }).extend({
      file_id: requestUploadSchema.shape.sha256.describe('dummy'),
    }).strip().shape.file_id
      ? { file_id: req.body.file_id }
      : { file_id: '' };

    // Simple validation
    if (!req.body.file_id || typeof req.body.file_id !== 'string') {
      return res.status(400).json({ success: false, error: 'file_id é obrigatório' });
    }
    const fileId = req.body.file_id.trim();

    // Find the file
    const file = await prisma.accounting_company_document_files.findUnique({
      where: { id: fileId },
      include: { document: { select: { legal_entity_id: true } } },
    });
    if (!file) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    // Verify the accountant uploaded this file
    if (file.uploaded_by_accountant_id !== accountant.id) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Verify file exists in S3
    const verification = await verifyUpload(file.storage_key, file.size_bytes);
    if (!verification.exists) {
      return res.status(400).json({ success: false, error: 'Upload não encontrado no storage. Tente novamente.' });
    }
    if (!verification.sizeMatch) {
      return res.status(400).json({
        success: false,
        error: `Tamanho divergente: esperado ${file.size_bytes}, recebido ${verification.actualSize}`,
      });
    }

    res.json({ success: true, data: { confirmed: true, file: serializeDocumentFile(file) } });
  } catch (err: any) {
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
 */
router.get('/documents/:documentId/files/:fileId/download', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { documentId, fileId } = req.params;

    // Find the file
    const file = await prisma.accounting_company_document_files.findFirst({
      where: { id: fileId, document_id: documentId },
      include: { document: { select: { legal_entity_id: true } } },
    });
    if (!file) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    // Scope validation
    const link = await verifyEntityAccess(accountant.id, file.document.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    // Check permission: can_download
    if (!link.can_download) {
      return res.status(403).json({ success: false, error: 'Sem permissão de download para esta empresa' });
    }

    // Check scan status: INFECTED blocks download
    if (file.scan_status === accounting_document_scan_status.INFECTED) {
      return res.status(403).json({ success: false, error: 'Download bloqueado: arquivo marcado como infectado' });
    }

    // Generate presigned download URL
    const { downloadUrl, expiresInSeconds } = await generatePresignedGetUrl({
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
    });

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
