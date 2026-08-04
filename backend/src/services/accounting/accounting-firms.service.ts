import { prisma } from '../../lib/prisma';
import { paginationResult } from './accounting-validation';
import { EntityValidationError } from './accounting-entities.service';
import { writeAccountingAuditTx } from './accounting-audit';

interface ListFirmsParams {
  page: number;
  limit: number;
  search?: string;
  is_active?: boolean;
}

interface CreateFirmInput {
  razao_social: string;
  nome_fantasia?: string | null;
  document_type: 'CNPJ' | 'CPF';
  document_number: string;
  crc?: string | null;
  crc_uf?: string | null;
  email: string;
  telefone?: string | null;
}

interface UpdateFirmInput {
  razao_social?: string;
  nome_fantasia?: string | null;
  document_type?: 'CNPJ' | 'CPF';
  document_number?: string;
  crc?: string | null;
  crc_uf?: string | null;
  email?: string;
  telefone?: string | null;
  is_active?: boolean;
}

export async function listAccountingFirms(params: ListFirmsParams) {
  const { page, limit, search, is_active } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (is_active !== undefined) where.is_active = is_active;
  if (search) {
    where.OR = [
      { razao_social: { contains: search, mode: 'insensitive' } },
      { nome_fantasia: { contains: search, mode: 'insensitive' } },
      { document_number: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.accounting_firms.findMany({
      where,
      include: { _count: { select: { accountants: true } } },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.accounting_firms.count({ where }),
  ]);

  return paginationResult(rows, total, page, limit);
}

export async function getAccountingFirm(id: string) {
  return prisma.accounting_firms.findUnique({
    where: { id },
    include: { _count: { select: { accountants: true } } },
  });
}

export async function createAccountingFirm(data: CreateFirmInput, adminId: string, ip?: string, userAgent?: string) {
  // Validate document_type matches document_number length
  if (data.document_type === 'CNPJ' && data.document_number.length !== 14) {
    throw new EntityValidationError('CNPJ deve conter 14 dígitos');
  }
  if (data.document_type === 'CPF' && data.document_number.length !== 11) {
    throw new EntityValidationError('CPF deve conter 11 dígitos');
  }

  // Check duplicate document_number
  const existing = await prisma.accounting_firms.findUnique({
    where: { document_number: data.document_number },
  });
  if (existing) {
    throw new EntityValidationError('Documento já cadastrado');
  }

  return prisma.$transaction(async (tx) => {
    const firm = await tx.accounting_firms.create({
      data: {
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia ?? null,
        document_type: data.document_type,
        document_number: data.document_number,
        crc: data.crc ?? null,
        crc_uf: data.crc_uf ?? null,
        email: data.email,
        telefone: data.telefone ?? null,
      },
      include: { _count: { select: { accountants: true } } },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'CREATE_ACCOUNTING_FIRM',
      entityType: 'accounting_firm',
      entityId: firm.id,
      newValue: data,
      ipAddress: ip,
      userAgent,
    });

    return firm;
  });
}

export async function updateAccountingFirm(id: string, data: UpdateFirmInput, adminId: string, ip?: string, userAgent?: string) {
  const firm = await prisma.accounting_firms.findUnique({ where: { id } });
  if (!firm) return null;

  if (data.document_number && data.document_number !== firm.document_number) {
    const existing = await prisma.accounting_firms.findUnique({
      where: { document_number: data.document_number },
    });
    if (existing) {
      throw new EntityValidationError('Documento já cadastrado por outro escritório');
    }
  }

  // Prevent deactivation with active accountants
  if (data.is_active === false && firm.is_active === true) {
    const activeAccountants = await prisma.accountants.count({
      where: { accounting_firm_id: id, is_active: true },
    });
    if (activeAccountants > 0) {
      throw new EntityValidationError('Não é possível desativar escritório com contadores ativos');
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.accounting_firms.update({
      where: { id },
      data,
      include: { _count: { select: { accountants: true } } },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'UPDATE_ACCOUNTING_FIRM',
      entityType: 'accounting_firm',
      entityId: id,
      oldValue: firm,
      newValue: data,
      ipAddress: ip,
      userAgent,
    });

    return updated;
  });
}
