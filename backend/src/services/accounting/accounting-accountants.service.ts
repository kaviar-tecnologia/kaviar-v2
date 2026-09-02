import { prisma } from '../../lib/prisma';
import { paginationResult } from './accounting-validation';
import { EntityValidationError } from './accounting-entities.service';
import { writeAccountingAuditTx } from './accounting-audit';

interface ListAccountantsParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  is_active?: boolean;
  accounting_firm_id?: string;
}

interface CreateAccountantInput {
  accounting_firm_id: string;
  nome_completo: string;
  email: string;
  cpf?: string | null;
  crc?: string | null;
  crc_uf?: string | null;
  job_title?: string | null;
  department?: string | null;
  is_responsible_accountant?: boolean;
}

interface UpdateAccountantInput {
  nome_completo?: string;
  email?: string;
  crc?: string | null;
  crc_uf?: string | null;
  job_title?: string | null;
  department?: string | null;
  is_responsible_accountant?: boolean;
  status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'REVOKED';
  is_active?: boolean;
}

function resolveIsActive(status: string): boolean {
  return status === 'ACTIVE';
}

export async function listAccountants(params: ListAccountantsParams) {
  const { page, limit, search, status, is_active, accounting_firm_id } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;
  if (is_active !== undefined) where.is_active = is_active;
  if (accounting_firm_id) where.accounting_firm_id = accounting_firm_id;
  if (search) {
    where.OR = [
      { nome_completo: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { cpf: { contains: search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.accountants.findMany({
      where,
      include: { firm: true },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.accountants.count({ where }),
  ]);

  return paginationResult(rows, total, page, limit);
}

export async function getAccountant(id: string) {
  return prisma.accountants.findUnique({
    where: { id },
    include: { firm: true },
  });
}

export async function createAccountant(data: CreateAccountantInput, adminId: string, ip?: string, userAgent?: string) {
  // Validate firm exists
  const firm = await prisma.accounting_firms.findUnique({
    where: { id: data.accounting_firm_id },
  });
  if (!firm) {
    throw new EntityValidationError('Escritório contábil não encontrado');
  }
  if (!firm.is_active) {
    throw new EntityValidationError('Escritório contábil está inativo');
  }

  // Check duplicate email
  const existingEmail = await prisma.accountants.findUnique({ where: { email: data.email } });
  if (existingEmail) {
    throw new EntityValidationError('E-mail já cadastrado');
  }

  // Check duplicate CPF only when informed
  if (data.cpf) {
    const existingCpf = await prisma.accountants.findUnique({ where: { cpf: data.cpf } });
    if (existingCpf) {
      throw new EntityValidationError('CPF já cadastrado');
    }
  }

  const initialStatus = 'INVITED';

  return prisma.$transaction(async (tx) => {
    const accountant = await tx.accountants.create({
      data: {
        accounting_firm_id: data.accounting_firm_id,
        nome_completo: data.nome_completo,
        email: data.email,
        cpf: data.cpf ?? null,
        crc: data.crc ?? null,
        crc_uf: data.crc_uf ?? null,
        job_title: data.job_title ?? null,
        department: data.department ?? null,
        is_responsible_accountant: data.is_responsible_accountant ?? false,
        status: initialStatus,
        is_active: resolveIsActive(initialStatus),
        invited_at: new Date(),
      },
      include: { firm: true },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'CREATE_ACCOUNTANT',
      entityType: 'accountant',
      entityId: accountant.id,
      newValue: data,
      ipAddress: ip,
      userAgent,
    });

    return accountant;
  });
}

export async function updateAccountant(id: string, data: UpdateAccountantInput, adminId: string, ip?: string, userAgent?: string) {
  const accountant = await prisma.accountants.findUnique({ where: { id } });
  if (!accountant) return null;

  if (data.email && data.email !== accountant.email) {
    const existing = await prisma.accountants.findUnique({ where: { email: data.email } });
    if (existing) throw new EntityValidationError('E-mail já cadastrado por outro contador');
  }

  // Build update payload — enforce status/is_active coherence
  const updateData: any = { ...data };

  // Remove is_active from client input — it's derived from status
  delete updateData.is_active;

  // If status changes, set is_active accordingly
  const effectiveStatus = data.status ?? accountant.status;
  updateData.is_active = resolveIsActive(effectiveStatus);

  // If activating, set activated_at
  if (data.status === 'ACTIVE' && accountant.status !== 'ACTIVE') {
    updateData.activated_at = new Date();
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.accountants.update({
      where: { id },
      data: updateData,
      include: { firm: true },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'UPDATE_ACCOUNTANT',
      entityType: 'accountant',
      entityId: id,
      oldValue: accountant,
      newValue: data,
      ipAddress: ip,
      userAgent,
    });

    return updated;
  });
}
