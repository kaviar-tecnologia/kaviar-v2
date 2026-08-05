import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import {
  createDocumentTypeSchema,
  updateDocumentTypeSchema,
  listDocumentTypesQuerySchema,
} from '../services/accounting/accounting-documents-validation';
import { serializeDocumentType } from '../services/accounting/accounting-documents-serializers';

const prisma = new PrismaClient();
const router = Router();

// Auth: SUPER_ADMIN only
router.use(authenticateAdmin);
router.use(requireSuperAdmin);

/**
 * GET /document-types
 * List all document types (active and inactive).
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = listDocumentTypesQuerySchema.parse(req.query);

    const where: any = {};
    if (query.category) where.category = query.category;
    if (query.is_active !== undefined) where.is_active = query.is_active;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

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
    console.error('[admin-doc-types] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * GET /document-types/:id
 * Get document type detail.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const docType = await prisma.accounting_document_types.findUnique({
      where: { id: req.params.id },
    });
    if (!docType) return res.status(404).json({ success: false, error: 'Tipo de documento não encontrado' });

    res.json({ success: true, data: serializeDocumentType(docType) });
  } catch (err: any) {
    console.error('[admin-doc-types] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /document-types
 * Create a new document type.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createDocumentTypeSchema.parse(req.body);

    // Check code uniqueness
    const existing = await prisma.accounting_document_types.findUnique({ where: { code: data.code } });
    if (existing) {
      return res.status(409).json({ success: false, error: `Código "${data.code}" já existe` });
    }

    const docType = await prisma.accounting_document_types.create({ data });
    res.status(201).json({ success: true, data: serializeDocumentType(docType) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Código já existe' });
    console.error('[admin-doc-types] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * PATCH /document-types/:id
 * Update document type (code is immutable after creation).
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const data = updateDocumentTypeSchema.parse(req.body);

    const existing = await prisma.accounting_document_types.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Tipo de documento não encontrado' });

    const updated = await prisma.accounting_document_types.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ success: true, data: serializeDocumentType(updated) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[admin-doc-types] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const adminDocumentTypesRoutes = router;
export default router;
