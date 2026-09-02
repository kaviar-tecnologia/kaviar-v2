import { z } from 'zod';

// ── Helpers ──────────────────────────────────────────────────────────────────

function strictTrimmedString(maxLength = 200) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1).max(maxLength),
  );
}

function optionalNullableTrimmedString(maxLength = 200) {
  return z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  }, z.string().max(maxLength).nullable().optional());
}

function paginationSchema(defaultLimit = 25) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(defaultLimit),
  });
}

function optionalBooleanQuery() {
  return z.enum(['true', 'false']).transform((v) => v === 'true').optional();
}

const cnpjRegex = /^\d{14}$/;
const cpfRegex = /^\d{11}$/;
const ufRegex = /^[A-Z]{2}$/;

// ── Legal Entities ───────────────────────────────────────────────────────────

export const createLegalEntitySchema = z.object({
  razao_social: strictTrimmedString(300),
  nome_fantasia: optionalNullableTrimmedString(300),
  cnpj: z.string().regex(cnpjRegex, 'CNPJ deve conter exatamente 14 dígitos'),
  entity_type: z.enum(['MATRIZ', 'FILIAL']),
  parent_entity_id: z.string().uuid().optional().nullable(),
  uf: z.string().regex(ufRegex, 'UF deve ser 2 letras maiúsculas').optional().nullable(),
  municipio: optionalNullableTrimmedString(200),
  endereco: optionalNullableTrimmedString(500),
}).strict();

export const updateLegalEntitySchema = z.object({
  razao_social: strictTrimmedString(300).optional(),
  nome_fantasia: optionalNullableTrimmedString(300),
  entity_type: z.enum(['MATRIZ', 'FILIAL']).optional(),
  parent_entity_id: z.string().uuid().optional().nullable(),
  uf: z.string().regex(ufRegex, 'UF deve ser 2 letras maiúsculas').optional().nullable(),
  municipio: optionalNullableTrimmedString(200),
  endereco: optionalNullableTrimmedString(500),
  is_active: z.boolean().optional(),
}).strict();

export const listLegalEntitiesQuerySchema = paginationSchema().extend({
  search: z.string().max(120).optional(),
  entity_type: z.enum(['MATRIZ', 'FILIAL']).optional(),
  is_active: optionalBooleanQuery(),
  parent_entity_id: z.string().uuid().optional(),
});

// ── Accounting Firms ─────────────────────────────────────────────────────────

export const createAccountingFirmSchema = z.object({
  razao_social: strictTrimmedString(300),
  nome_fantasia: optionalNullableTrimmedString(300),
  document_type: z.enum(['CNPJ', 'CPF']),
  document_number: z.string().refine(
    (v) => cnpjRegex.test(v) || cpfRegex.test(v),
    'Documento deve conter 11 (CPF) ou 14 (CNPJ) dígitos',
  ),
  crc: optionalNullableTrimmedString(30),
  crc_uf: z.string().regex(ufRegex).optional().nullable(),
  email: z.string().email().max(255),
  telefone: optionalNullableTrimmedString(20),
}).strict();

export const updateAccountingFirmSchema = z.object({
  razao_social: strictTrimmedString(300).optional(),
  nome_fantasia: optionalNullableTrimmedString(300),
  document_type: z.enum(['CNPJ', 'CPF']).optional(),
  document_number: z.string().refine(
    (v) => cnpjRegex.test(v) || cpfRegex.test(v),
    'Documento deve conter 11 (CPF) ou 14 (CNPJ) dígitos',
  ).optional(),
  crc: optionalNullableTrimmedString(30),
  crc_uf: z.string().regex(ufRegex).optional().nullable(),
  email: z.string().email().max(255).optional(),
  telefone: optionalNullableTrimmedString(20),
  is_active: z.boolean().optional(),
}).strict();

export const listAccountingFirmsQuerySchema = paginationSchema().extend({
  search: z.string().max(120).optional(),
  is_active: optionalBooleanQuery(),
});

// ── Accountants ──────────────────────────────────────────────────────────────

export const createAccountantSchema = z.object({
  accounting_firm_id: z.string().uuid(),
  nome_completo: strictTrimmedString(300),
  email: z.string().email().max(255),
  cpf: z.string().regex(cpfRegex, 'CPF deve conter exatamente 11 dígitos').optional().nullable(),
  crc: optionalNullableTrimmedString(30),
  crc_uf: z.string().regex(ufRegex).optional().nullable(),
  job_title: optionalNullableTrimmedString(100),
  department: optionalNullableTrimmedString(100),
  is_responsible_accountant: z.boolean().optional(),
}).strict();

export const updateAccountantSchema = z.object({
  nome_completo: strictTrimmedString(300).optional(),
  email: z.string().email().max(255).optional(),
  crc: optionalNullableTrimmedString(30),
  crc_uf: z.string().regex(ufRegex).optional().nullable(),
  job_title: optionalNullableTrimmedString(100),
  department: optionalNullableTrimmedString(100),
  is_responsible_accountant: z.boolean().optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'REVOKED']).optional(),
  is_active: z.boolean().optional(),
}).strict();

export const listAccountantsQuerySchema = paginationSchema().extend({
  search: z.string().max(120).optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'REVOKED']).optional(),
  is_active: optionalBooleanQuery(),
  accounting_firm_id: z.string().uuid().optional(),
});

// ── Accountant Entity Links ──────────────────────────────────────────────────

export const createAccountantLinkSchema = z.object({
  accountant_id: z.string().uuid(),
  legal_entity_id: z.string().uuid(),
  scope: z.enum(['FISCAL', 'CONTABIL', 'FOLHA', 'SOCIETARIO', 'FINANCEIRO', 'MUNICIPAL', 'COMPLETO']),
  can_view: z.boolean().default(true),
  can_upload: z.boolean().default(false),
  can_download: z.boolean().default(true),
  can_request_correction: z.boolean().default(false),
  can_mark_processed: z.boolean().default(false),
  can_close_period: z.boolean().default(false),
  inherits_children: z.boolean().default(false),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().optional().nullable(),
}).strict();

export const updateAccountantLinkSchema = z.object({
  can_view: z.boolean().optional(),
  can_upload: z.boolean().optional(),
  can_download: z.boolean().optional(),
  can_request_correction: z.boolean().optional(),
  can_mark_processed: z.boolean().optional(),
  can_close_period: z.boolean().optional(),
  inherits_children: z.boolean().optional(),
  ends_at: z.string().datetime().optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']).optional(),
}).strict();

export const listAccountantLinksQuerySchema = paginationSchema().extend({
  accountant_id: z.string().uuid().optional(),
  legal_entity_id: z.string().uuid().optional(),
  scope: z.enum(['FISCAL', 'CONTABIL', 'FOLHA', 'SOCIETARIO', 'FINANCEIRO', 'MUNICIPAL', 'COMPLETO']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']).optional(),
});

// ── Pagination result helper ─────────────────────────────────────────────────

export function paginationResult<T>(rows: T[], total: number, page: number, limit: number) {
  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}
