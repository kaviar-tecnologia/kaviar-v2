import { prisma } from '../../lib/prisma';
import { paginationResult } from './accounting-validation';
import { writeAccountingAuditTx } from './accounting-audit';

interface ListEntitiesParams {
  page: number;
  limit: number;
  search?: string;
  entity_type?: 'MATRIZ' | 'FILIAL';
  is_active?: boolean;
  parent_entity_id?: string;
}

interface CreateEntityInput {
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj: string;
  entity_type: 'MATRIZ' | 'FILIAL';
  parent_entity_id?: string | null;
  uf?: string | null;
  municipio?: string | null;
  endereco?: string | null;
}

interface UpdateEntityInput {
  razao_social?: string;
  nome_fantasia?: string | null;
  entity_type?: 'MATRIZ' | 'FILIAL';
  parent_entity_id?: string | null;
  uf?: string | null;
  municipio?: string | null;
  endereco?: string | null;
  is_active?: boolean;
}

export async function listLegalEntities(params: ListEntitiesParams) {
  const { page, limit, search, entity_type, is_active, parent_entity_id } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (entity_type) where.entity_type = entity_type;
  if (is_active !== undefined) where.is_active = is_active;
  if (parent_entity_id) where.parent_entity_id = parent_entity_id;
  if (search) {
    where.OR = [
      { razao_social: { contains: search, mode: 'insensitive' } },
      { nome_fantasia: { contains: search, mode: 'insensitive' } },
      { cnpj: { contains: search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.legal_entities.findMany({
      where,
      include: { parent: true, _count: { select: { children: true } } },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.legal_entities.count({ where }),
  ]);

  return paginationResult(rows, total, page, limit);
}

export async function getLegalEntity(id: string) {
  return prisma.legal_entities.findUnique({
    where: { id },
    include: { parent: true, _count: { select: { children: true, accountant_links: true } } },
  });
}

export async function createLegalEntity(data: CreateEntityInput, adminId: string, ip?: string, userAgent?: string) {
  // Business rule: FILIAL must have a parent that is MATRIZ
  if (data.entity_type === 'FILIAL') {
    if (!data.parent_entity_id) {
      throw new EntityValidationError('Filial deve ter parent_entity_id de uma MATRIZ');
    }
    const parent = await prisma.legal_entities.findUnique({
      where: { id: data.parent_entity_id },
    });
    if (!parent) {
      throw new EntityValidationError('Entidade pai não encontrada');
    }
    if (parent.entity_type !== 'MATRIZ') {
      throw new EntityValidationError('Entidade pai deve ser do tipo MATRIZ');
    }
  }

  // Check duplicate CNPJ
  const existing = await prisma.legal_entities.findUnique({ where: { cnpj: data.cnpj } });
  if (existing) {
    throw new EntityValidationError('CNPJ já cadastrado');
  }

  return prisma.$transaction(async (tx) => {
    const entity = await tx.legal_entities.create({
      data: {
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia ?? null,
        cnpj: data.cnpj,
        entity_type: data.entity_type,
        parent_entity_id: data.parent_entity_id ?? null,
        uf: data.uf ?? null,
        municipio: data.municipio ?? null,
        endereco: data.endereco ?? null,
      },
      include: { parent: true, _count: { select: { children: true } } },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'CREATE_LEGAL_ENTITY',
      entityType: 'legal_entity',
      entityId: entity.id,
      newValue: data,
      ipAddress: ip,
      userAgent,
    });

    return entity;
  });
}

export async function updateLegalEntity(id: string, data: UpdateEntityInput, adminId: string, ip?: string, userAgent?: string) {
  const entity = await prisma.legal_entities.findUnique({ where: { id } });
  if (!entity) return null;

  const entityType = data.entity_type ?? entity.entity_type;
  const parentId = data.parent_entity_id !== undefined ? data.parent_entity_id : entity.parent_entity_id;

  // Prevent self-reference
  if (parentId === id) {
    throw new EntityValidationError('Entidade não pode ser pai de si mesma');
  }

  if (entityType === 'FILIAL' && parentId) {
    const parent = await prisma.legal_entities.findUnique({ where: { id: parentId } });
    if (!parent) throw new EntityValidationError('Entidade pai não encontrada');
    if (parent.entity_type !== 'MATRIZ') throw new EntityValidationError('Entidade pai deve ser do tipo MATRIZ');
  }

  if (entityType === 'FILIAL' && !parentId) {
    throw new EntityValidationError('Filial deve ter parent_entity_id de uma MATRIZ');
  }

  // Prevent deactivation with active links
  if (data.is_active === false && entity.is_active === true) {
    const activeLinks = await prisma.accountant_entity_links.count({
      where: { legal_entity_id: id, status: 'ACTIVE' },
    });
    if (activeLinks > 0) {
      throw new EntityValidationError('Não é possível desativar entidade com vínculos ativos');
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.legal_entities.update({
      where: { id },
      data,
      include: { parent: true, _count: { select: { children: true } } },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'UPDATE_LEGAL_ENTITY',
      entityType: 'legal_entity',
      entityId: id,
      oldValue: entity,
      newValue: data,
      ipAddress: ip,
      userAgent,
    });

    return updated;
  });
}

// ── Error class ──────────────────────────────────────────────────────────────

export class EntityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntityValidationError';
  }
}
