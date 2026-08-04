import { prisma } from '../../lib/prisma';
import { paginationResult } from './accounting-validation';

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

export async function createLegalEntity(data: CreateEntityInput) {
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

  return prisma.legal_entities.create({
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
}

export async function updateLegalEntity(id: string, data: UpdateEntityInput) {
  const entity = await prisma.legal_entities.findUnique({ where: { id } });
  if (!entity) return null;

  const entityType = data.entity_type ?? entity.entity_type;
  const parentId = data.parent_entity_id !== undefined ? data.parent_entity_id : entity.parent_entity_id;

  if (entityType === 'FILIAL' && parentId) {
    const parent = await prisma.legal_entities.findUnique({ where: { id: parentId } });
    if (!parent) throw new EntityValidationError('Entidade pai não encontrada');
    if (parent.entity_type !== 'MATRIZ') throw new EntityValidationError('Entidade pai deve ser do tipo MATRIZ');
  }

  if (entityType === 'FILIAL' && !parentId) {
    throw new EntityValidationError('Filial deve ter parent_entity_id de uma MATRIZ');
  }

  return prisma.legal_entities.update({
    where: { id },
    data,
    include: { parent: true, _count: { select: { children: true } } },
  });
}

// ── Error class ──────────────────────────────────────────────────────────────

export class EntityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntityValidationError';
  }
}
