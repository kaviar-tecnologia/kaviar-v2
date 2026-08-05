import { z } from 'zod';

// -- Pagination & Filters --

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// -- Document Types (Admin) --

export const createDocumentTypeSchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[A-Z0-9_]+$/, 'Código deve conter apenas A-Z, 0-9, _'),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullish().transform(v => v || null),
  category: z.enum(['SOCIETARIO', 'FISCAL', 'TRABALHISTA', 'CERTIFICADO', 'PROCURACAO', 'LICENCA', 'INSCRICAO', 'OUTRO']),
  requires_validity: z.boolean().default(false),
  renewal_alert_days: z.number().int().min(1).max(365).nullish().transform(v => v || null),
  sort_order: z.number().int().min(0).default(0),
}).strict();

export const updateDocumentTypeSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).nullish().transform(v => v || null),
  category: z.enum(['SOCIETARIO', 'FISCAL', 'TRABALHISTA', 'CERTIFICADO', 'PROCURACAO', 'LICENCA', 'INSCRICAO', 'OUTRO']).optional(),
  requires_validity: z.boolean().optional(),
  renewal_alert_days: z.number().int().min(1).max(365).nullish().transform(v => v || null),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
}).strict();

export const listDocumentTypesQuerySchema = paginationSchema.extend({
  category: z.enum(['SOCIETARIO', 'FISCAL', 'TRABALHISTA', 'CERTIFICADO', 'PROCURACAO', 'LICENCA', 'INSCRICAO', 'OUTRO']).optional(),
  is_active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().trim().max(100).optional(),
});

// -- Company Documents (Accountant Portal) --

export const createCompanyDocumentSchema = z.object({
  legal_entity_id: z.string().uuid(),
  document_type_id: z.string().uuid(),
  issued_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  valid_from: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  expires_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  reference_number: z.string().trim().max(100).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
}).strict();

export const updateCompanyDocumentSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'REJECTED', 'REPLACED', 'REVOKED']).optional(),
  issued_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  valid_from: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  expires_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  reference_number: z.string().trim().max(100).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
}).strict();

export const listCompanyDocumentsQuerySchema = paginationSchema.extend({
  legal_entity_id: z.string().uuid().optional(),
  document_type_id: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'SENT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'REJECTED', 'REPLACED', 'REVOKED']).optional(),
  category: z.enum(['SOCIETARIO', 'FISCAL', 'TRABALHISTA', 'CERTIFICADO', 'PROCURACAO', 'LICENCA', 'INSCRICAO', 'OUTRO']).optional(),
  temporal_status: z.enum(['NO_EXPIRY', 'VALID', 'EXPIRING_SOON', 'EXPIRED']).optional(),
});

// -- File Upload --

export const requestUploadSchema = z.object({
  document_id: z.string().uuid(),
  filename: z.string().trim().min(3).max(255),
  mime_type: z.string().trim().min(3).max(100),
  size_bytes: z.number().int().min(1),
  sha256: z.string().trim().length(64).regex(/^[a-f0-9]+$/, 'SHA-256 deve ser hex lowercase de 64 caracteres'),
  replacement_reason: z.string().trim().max(500).nullish().transform(v => v || null),
}).strict();

export const confirmUploadSchema = z.object({
  file_id: z.string().uuid(),
}).strict();

// -- Valid status transitions --

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT'],
  SENT: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['ACTIVE'],
  ACTIVE: ['REPLACED', 'REVOKED'],
  REJECTED: ['DRAFT'],
  REPLACED: [],
  REVOKED: [],
};
