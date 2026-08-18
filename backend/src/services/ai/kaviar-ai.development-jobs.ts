import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { DevelopmentIntentCategory } from './kaviar-ai.types';

export type DevelopmentJobStatus =
  | 'AWAITING_CONFIRMATION'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface DevelopmentJobActor {
  adminId: string;
  adminEmail?: string;
  role: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateDevelopmentJobInput {
  category: DevelopmentIntentCategory;
  summary: string;
}

export class DevelopmentJobError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'DevelopmentJobError';
  }
}

const ALLOWED_CATEGORIES = new Set<DevelopmentIntentCategory>([
  'BUG_FIX',
  'FEATURE',
  'REFACTOR',
  'CODE_CHANGE',
]);

const MAX_SUMMARY_LENGTH = 1000;

function requireSuperAdmin(actor: DevelopmentJobActor): void {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new DevelopmentJobError(
      'DEVELOPMENT_JOB_FORBIDDEN',
      'Apenas SUPER_ADMIN pode criar ou confirmar jobs de desenvolvimento.',
      403,
    );
  }
}

function validateCreateInput(input: CreateDevelopmentJobInput): {
  category: DevelopmentIntentCategory;
  summary: string;
} {
  if (!ALLOWED_CATEGORIES.has(input.category)) {
    throw new DevelopmentJobError(
      'DEVELOPMENT_JOB_INVALID_CATEGORY',
      'Categoria de desenvolvimento inválida.',
      400,
    );
  }

  const summary = input.summary.trim();

  if (!summary) {
    throw new DevelopmentJobError(
      'DEVELOPMENT_JOB_INVALID_SUMMARY',
      'Descrição do job é obrigatória.',
      400,
    );
  }

  if (summary.length > MAX_SUMMARY_LENGTH) {
    throw new DevelopmentJobError(
      'DEVELOPMENT_JOB_INVALID_SUMMARY',
      `Descrição do job deve ter no máximo ${MAX_SUMMARY_LENGTH} caracteres.`,
      400,
    );
  }

  return {
    category: input.category,
    summary,
  };
}

async function writeDevelopmentJobAuditTx(
  tx: Prisma.TransactionClient,
  actor: DevelopmentJobActor,
  params: {
    action: 'DEVELOPMENT_JOB_CREATED' | 'DEVELOPMENT_JOB_CONFIRMED';
    entityId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  },
): Promise<void> {
  const oldJson =
    params.oldValue !== undefined
      ? JSON.stringify(params.oldValue)
      : null;

  const newJson =
    params.newValue !== undefined
      ? JSON.stringify(params.newValue)
      : null;

  await tx.$executeRaw`
    INSERT INTO admin_audit_logs
      (
        admin_id,
        admin_email,
        action,
        entity_type,
        entity_id,
        old_value,
        new_value,
        ip_address,
        user_agent
      )
    VALUES (
      ${actor.adminId},
      ${actor.adminEmail ?? null},
      ${params.action},
      'development_job',
      ${params.entityId},
      ${oldJson}::jsonb,
      ${newJson}::jsonb,
      ${actor.ipAddress ?? null},
      ${actor.userAgent ?? null}
    )
  `;
}

export async function createDevelopmentJob(
  input: CreateDevelopmentJobInput,
  actor: DevelopmentJobActor,
) {
  requireSuperAdmin(actor);

  const validated = validateCreateInput(input);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.development_jobs.create({
      data: {
        category: validated.category,
        summary: validated.summary,
        status: 'AWAITING_CONFIRMATION',
        requested_by_admin_id: actor.adminId,
      },
    });

    await writeDevelopmentJobAuditTx(tx, actor, {
      action: 'DEVELOPMENT_JOB_CREATED',
      entityId: created.id,
      newValue: {
        category: created.category,
        status: created.status,
        requested_by_admin_id: created.requested_by_admin_id,
      },
    });

    return created;
  });
}

export async function confirmDevelopmentJob(
  jobId: string,
  actor: DevelopmentJobActor,
) {
  requireSuperAdmin(actor);

  const id = jobId.trim();

  if (!id) {
    throw new DevelopmentJobError(
      'DEVELOPMENT_JOB_INVALID_ID',
      'ID do job é obrigatório.',
      400,
    );
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.development_jobs.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new DevelopmentJobError(
        'DEVELOPMENT_JOB_NOT_FOUND',
        'Job de desenvolvimento não encontrado.',
        404,
      );
    }

    if (existing.status !== 'AWAITING_CONFIRMATION') {
      throw new DevelopmentJobError(
        'DEVELOPMENT_JOB_NOT_CONFIRMABLE',
        'Este job não está aguardando confirmação.',
        409,
      );
    }

    const confirmedAt = new Date();

    const updateResult = await tx.development_jobs.updateMany({
      where: {
        id,
        status: 'AWAITING_CONFIRMATION',
      },
      data: {
        status: 'QUEUED',
        confirmed_by_admin_id: actor.adminId,
        confirmed_at: confirmedAt,
      },
    });

    if (updateResult.count !== 1) {
      throw new DevelopmentJobError(
        'DEVELOPMENT_JOB_NOT_CONFIRMABLE',
        'Este job já foi confirmado ou mudou de estado.',
        409,
      );
    }

    const confirmed = await tx.development_jobs.findUnique({
      where: { id },
    });

    if (!confirmed) {
      throw new DevelopmentJobError(
        'DEVELOPMENT_JOB_NOT_FOUND',
        'Job de desenvolvimento não encontrado após confirmação.',
        404,
      );
    }

    await writeDevelopmentJobAuditTx(tx, actor, {
      action: 'DEVELOPMENT_JOB_CONFIRMED',
      entityId: confirmed.id,
      oldValue: {
        status: existing.status,
      },
      newValue: {
        status: confirmed.status,
        confirmed_by_admin_id: confirmed.confirmed_by_admin_id,
        confirmed_at: confirmed.confirmed_at,
      },
    });

    return confirmed;
  });
}
