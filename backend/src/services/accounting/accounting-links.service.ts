import { prisma } from '../../lib/prisma';
import { paginationResult } from './accounting-validation';
import { EntityValidationError } from './accounting-entities.service';

interface ListLinksParams {
  page: number;
  limit: number;
  accountant_id?: string;
  legal_entity_id?: string;
  scope?: string;
  status?: string;
}

interface CreateLinkInput {
  accountant_id: string;
  legal_entity_id: string;
  scope: 'FISCAL' | 'CONTABIL' | 'FOLHA' | 'SOCIETARIO' | 'FINANCEIRO' | 'MUNICIPAL' | 'COMPLETO';
  can_view?: boolean;
  can_upload?: boolean;
  can_download?: boolean;
  can_request_correction?: boolean;
  can_mark_processed?: boolean;
  can_close_period?: boolean;
  inherits_children?: boolean;
  starts_at: string;
  ends_at?: string | null;
  created_by_admin_id: string;
}

interface UpdateLinkInput {
  can_view?: boolean;
  can_upload?: boolean;
  can_download?: boolean;
  can_request_correction?: boolean;
  can_mark_processed?: boolean;
  can_close_period?: boolean;
  inherits_children?: boolean;
  ends_at?: string | null;
  status?: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
}

const linkInclude = {
  accountant: { select: { id: true, nome_completo: true } },
  legal_entity: { select: { id: true, razao_social: true, cnpj: true, entity_type: true } },
  created_by_admin: { select: { id: true, name: true, role: true } },
};

export async function listAccountantLinks(params: ListLinksParams) {
  const { page, limit, accountant_id, legal_entity_id, scope, status } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (accountant_id) where.accountant_id = accountant_id;
  if (legal_entity_id) where.legal_entity_id = legal_entity_id;
  if (scope) where.scope = scope;
  if (status) where.status = status;

  const [rows, total] = await Promise.all([
    prisma.accountant_entity_links.findMany({
      where,
      include: linkInclude,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.accountant_entity_links.count({ where }),
  ]);

  return paginationResult(rows, total, page, limit);
}

export async function getAccountantLink(id: string) {
  return prisma.accountant_entity_links.findUnique({
    where: { id },
    include: linkInclude,
  });
}

export async function createAccountantLink(data: CreateLinkInput) {
  // Validate accountant exists and is active
  const accountant = await prisma.accountants.findUnique({ where: { id: data.accountant_id } });
  if (!accountant) throw new EntityValidationError('Contador não encontrado');
  if (!accountant.is_active) throw new EntityValidationError('Contador está inativo');

  // Validate legal entity exists and is active
  const entity = await prisma.legal_entities.findUnique({ where: { id: data.legal_entity_id } });
  if (!entity) throw new EntityValidationError('Entidade jurídica não encontrada');
  if (!entity.is_active) throw new EntityValidationError('Entidade jurídica está inativa');

  // Check for duplicate active link with same scope
  const existingLink = await prisma.accountant_entity_links.findFirst({
    where: {
      accountant_id: data.accountant_id,
      legal_entity_id: data.legal_entity_id,
      scope: data.scope,
      status: 'ACTIVE',
    },
  });
  if (existingLink) {
    throw new EntityValidationError('Já existe um vínculo ativo com mesmo escopo para este contador e entidade');
  }

  return prisma.accountant_entity_links.create({
    data: {
      accountant_id: data.accountant_id,
      legal_entity_id: data.legal_entity_id,
      scope: data.scope,
      can_view: data.can_view ?? true,
      can_upload: data.can_upload ?? false,
      can_download: data.can_download ?? true,
      can_request_correction: data.can_request_correction ?? false,
      can_mark_processed: data.can_mark_processed ?? false,
      can_close_period: data.can_close_period ?? false,
      inherits_children: data.inherits_children ?? false,
      starts_at: new Date(data.starts_at),
      ends_at: data.ends_at ? new Date(data.ends_at) : null,
      status: 'ACTIVE',
      created_by_admin_id: data.created_by_admin_id,
    },
    include: linkInclude,
  });
}

export async function updateAccountantLink(id: string, data: UpdateLinkInput) {
  const link = await prisma.accountant_entity_links.findUnique({ where: { id } });
  if (!link) return null;

  const updateData: any = { ...data };
  if (data.ends_at !== undefined) {
    updateData.ends_at = data.ends_at ? new Date(data.ends_at) : null;
  }

  return prisma.accountant_entity_links.update({
    where: { id },
    data: updateData,
    include: linkInclude,
  });
}
