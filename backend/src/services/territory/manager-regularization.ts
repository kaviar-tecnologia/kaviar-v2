import { createHash, randomInt, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { normalizePhone } from '../../utils/referral';

export type RegularizationSelection = {
  adminId: string;
  assignment: boolean;
  referral: boolean;
};

type ManagerState = {
  selection: RegularizationSelection;
  admin: { id: string; name: string; role: string; is_active: boolean; phone: string | null } | null;
  profile: {
    id: string; territory_id: string; relationship_type: string; is_active: boolean;
    document_status: string; contract_status: string; terms_version: string | null;
    contract_url: string | null; contract_template_url: string | null; contract_signed_at: Date | null;
  } | null;
  access: { territory_id: string; access_level: string }[];
  assignments: {
    id: string; territory_id: string; admin_id: string; operator_profile_id: string | null;
    status: string; started_at: Date; ended_at: Date | null;
  }[];
  agents: { id: string; referral_code: string | null; is_active: boolean }[];
  phoneConflicts: string[];
};

export type RegularizationReport = {
  fingerprint: string;
  managers: {
    adminId: string;
    profileId: string | null;
    territoryId: string | null;
    requested: { assignment: boolean; referral: boolean };
    assignment: 'create' | 'preserve' | 'not_requested' | 'blocked';
    referral: 'create_agent' | 'create_code' | 'preserve' | 'not_requested' | 'blocked';
    referralCode: string | null;
    documentStatus: string | null;
    contractStatus: string | null;
    termsVersion: string | null;
    hasHistoricalContract: boolean;
    blockers: string[];
  }[];
};

type Tx = Prisma.TransactionClient;

export class RegularizationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function loadState(tx: Tx, selection: RegularizationSelection): Promise<ManagerState> {
  const admin = await tx.admins.findUnique({
    where: { id: selection.adminId },
    select: { id: true, name: true, role: true, is_active: true, phone: true },
  });
  const profile = await tx.operator_profiles.findUnique({
    where: { admin_id: selection.adminId },
    select: {
      id: true, territory_id: true, relationship_type: true, is_active: true,
      document_status: true, contract_status: true, terms_version: true, contract_url: true,
      contract_template_url: true, contract_signed_at: true,
    },
  });
  const access = await tx.admin_territory_access.findMany({
    where: { admin_id: selection.adminId },
    select: { territory_id: true, access_level: true },
    orderBy: { territory_id: 'asc' },
  });
  const assignments = await tx.territory_manager_assignments.findMany({
    where: { admin_id: selection.adminId },
    select: {
      id: true, territory_id: true, admin_id: true, operator_profile_id: true,
      status: true, started_at: true, ended_at: true,
    },
    orderBy: { id: 'asc' },
  });
  const agents = await tx.referral_agents.findMany({
    where: { email: `operator:${selection.adminId}` },
    select: { id: true, referral_code: true, is_active: true },
    orderBy: { id: 'asc' },
  });
  const phone = admin?.phone ? normalizePhone(admin.phone) : '';
  const phoneConflicts = phone ? (await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM referral_agents
    WHERE CASE
      WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 12
           AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE '55%'
      THEN substring(regexp_replace(phone, '[^0-9]', '', 'g') from 3)
      ELSE regexp_replace(phone, '[^0-9]', '', 'g')
    END = ${phone}
    ORDER BY id
  `).map(row => row.id) : [];
  return { selection, admin, profile, access, assignments, agents, phoneConflicts };
}

function reportFor(states: ManagerState[]): RegularizationReport {
  const managers = states.map(({ selection, admin, profile, access, assignments, agents, phoneConflicts }) => {
    const blockers: string[] = [];
    if (!admin || !admin.is_active || admin.role !== 'TERRITORIAL_MANAGER') blockers.push('inactive_or_invalid_manager');
    if (admin && /\bteste\b/i.test(admin.name)) blockers.push('test_account_requires_exclusion');
    if (!profile || profile.relationship_type !== 'territorial_manager') blockers.push('missing_or_invalid_profile');
    if (profile && !access.some(a => a.territory_id === profile.territory_id && a.access_level === 'full')) {
      blockers.push('missing_full_territory_access');
    }

    const current = assignments.filter(a =>
      a.territory_id === profile?.territory_id &&
      ['pending_approval', 'active', 'suspended'].includes(a.status) &&
      (!a.ended_at || a.ended_at.getTime() >= Date.now()),
    );
    if (selection.assignment && (current.length > 1 || current.some(a => a.operator_profile_id && a.operator_profile_id !== profile?.id))) {
      blockers.push('assignment_conflict');
    }
    if (selection.assignment && !current.length && assignments.some(a =>
      a.territory_id === profile?.territory_id && a.status === 'pending_approval',
    )) blockers.push('expired_pending_assignment_requires_review');
    if (selection.referral && agents.length > 1) blockers.push('multiple_referral_agents');
    if (selection.referral && agents.length === 1 && !agents[0].is_active) blockers.push('inactive_referral_agent');
    if (selection.referral && agents.length === 0) {
      const phone = admin?.phone ? normalizePhone(admin.phone) : '';
      if (!/^\d{10,11}$/.test(phone) || !admin?.name.trim()) blockers.push('missing_valid_referral_contact');
      if (phoneConflicts.length) blockers.push('referral_phone_conflict');
    }

    const blocked = blockers.length > 0;
    const assignment = !selection.assignment ? 'not_requested'
      : blocked ? 'blocked' : current.length ? 'preserve' : 'create';
    const referral = !selection.referral ? 'not_requested'
      : blocked ? 'blocked' : agents.length === 0 ? 'create_agent'
        : agents[0].referral_code ? 'preserve' : 'create_code';
    return {
      adminId: selection.adminId,
      profileId: profile?.id ?? null,
      territoryId: profile?.territory_id ?? null,
      requested: { assignment: selection.assignment, referral: selection.referral },
      assignment,
      referral,
      referralCode: agents.length === 1 ? agents[0].referral_code : null,
      documentStatus: profile?.document_status ?? null,
      contractStatus: profile?.contract_status ?? null,
      termsVersion: profile?.terms_version ?? null,
      hasHistoricalContract: !!(profile?.contract_url || profile?.contract_signed_at || profile?.contract_template_url),
      blockers,
    } as RegularizationReport['managers'][number];
  });
  return { fingerprint: hash({ states, managers }), managers };
}

async function report(tx: Tx, selections: RegularizationSelection[]): Promise<RegularizationReport> {
  const states: ManagerState[] = [];
  for (const selection of selections) states.push(await loadState(tx, selection));
  return reportFor(states);
}

function validateSelections(selections: RegularizationSelection[]): RegularizationSelection[] {
  if (!Array.isArray(selections) || selections.length === 0 || selections.length > 50) {
    throw new RegularizationError('INVALID_SELECTION', 'Selecione entre 1 e 50 gestores.');
  }
  const ids = new Set<string>();
  for (const s of selections) {
    if (!s || typeof s.adminId !== 'string' || !s.adminId.trim() ||
      typeof s.assignment !== 'boolean' || typeof s.referral !== 'boolean' ||
      (!s.assignment && !s.referral) || ids.has(s.adminId)) {
      throw new RegularizationError('INVALID_SELECTION', 'Seleção inválida ou duplicada.');
    }
    ids.add(s.adminId);
  }
  return [...selections].sort((a, b) => a.adminId.localeCompare(b.adminId));
}

export async function previewRegularization(prisma: PrismaClient, selections: RegularizationSelection[]): Promise<RegularizationReport> {
  const selected = validateSelections(selections);
  return prisma.$transaction(tx => report(tx, selected), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function assertDatabaseGuards(tx: Tx): Promise<void> {
  const indexes = await tx.$queryRaw<{ indexname: string; indexdef: string; tablename: string; predicate: string }[]>`
    SELECT i.indexname, i.indexdef, i.tablename, pg_get_expr(x.indpred, x.indrelid) AS predicate FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
    JOIN pg_index x ON x.indexrelid = c.oid
    WHERE i.schemaname = current_schema() AND x.indisvalid AND x.indisunique
      AND i.indexname IN ('tma_pending_admin_territory_unique', 'referral_agents_operator_email_unique')
  `;
  const assignment = indexes.find(i => i.indexname === 'tma_pending_admin_territory_unique');
  const agent = indexes.find(i => i.indexname === 'referral_agents_operator_email_unique');
  if (assignment?.tablename !== 'territory_manager_assignments' ||
      !assignment.indexdef.includes('(admin_id, territory_id)') ||
      !assignment.predicate?.includes('pending_approval') || !assignment.predicate?.includes('status') ||
      agent?.tablename !== 'referral_agents' || !agent.indexdef.includes('(email)') ||
      !agent.predicate?.includes('operator:%')) {
    throw new RegularizationError('DATABASE_GUARDS_MISSING', 'Restrições de unicidade ausentes ou incompatíveis.');
  }
}

async function newCode(tx: Tx): Promise<string> {
  const chars = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `TERR${Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('')}`;
    if (!await tx.referral_agents.findUnique({ where: { referral_code: code }, select: { id: true } })) return code;
  }
  throw new RegularizationError('CODE_EXHAUSTED', 'Não foi possível gerar um código único.');
}

export async function executeRegularization(
  prisma: PrismaClient,
  actorId: string,
  selections: RegularizationSelection[],
  expectedFingerprint: string,
  reason: string,
): Promise<{ runId: string; before: RegularizationReport; after: RegularizationReport }> {
  const selected = validateSelections(selections);
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint) || typeof reason !== 'string' || reason.trim().length < 8 || reason.length > 300) {
    throw new RegularizationError('INVALID_APPROVAL', 'Informe o hash da prévia e um motivo válido.');
  }
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE admins, operator_profiles, admin_territory_access, territory_manager_assignments, referral_agents IN SHARE ROW EXCLUSIVE MODE`;
    await assertDatabaseGuards(tx);
    const actor = await tx.admins.findUnique({ where: { id: actorId }, select: { role: true, is_active: true } });
    if (!actor?.is_active || actor.role !== 'SUPER_ADMIN') {
      throw new RegularizationError('FORBIDDEN', 'Administrador não autorizado.');
    }
    const before = await report(tx, selected);
    if (before.fingerprint !== expectedFingerprint) {
      throw new RegularizationError('STALE_PREVIEW', 'Os dados mudaram. Gere e revise uma nova prévia.');
    }
    if (before.managers.some(m => m.blockers.length)) {
      throw new RegularizationError('BLOCKED', 'A prévia contém conflitos que exigem revisão.');
    }
    const runId = randomUUID();
    for (const item of before.managers) {
      if (item.assignment === 'create' && item.profileId && item.territoryId) {
        const created = await tx.territory_manager_assignments.create({
          data: {
            admin_id: item.adminId, territory_id: item.territoryId, operator_profile_id: item.profileId,
            status: 'pending_approval', started_at: new Date(), created_by: actorId,
          },
        });
        await tx.$executeRaw`
          INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_value, reason)
          VALUES (${actorId}, 'manager_regularization_assignment', 'territory_manager_assignment', ${created.id},
            ${JSON.stringify({ runId, adminId: item.adminId, territoryId: item.territoryId, status: 'pending_approval' })}::jsonb, ${reason.trim()})
        `;
      }
      if (item.referral === 'create_agent' || item.referral === 'create_code') {
        const code = await newCode(tx);
        const state = await loadState(tx, selected.find(s => s.adminId === item.adminId)!);
        const agent = item.referral === 'create_agent'
          ? await tx.referral_agents.create({
              data: {
                name: state.admin!.name, phone: normalizePhone(state.admin!.phone!),
                email: `operator:${item.adminId}`, referral_code: code, is_active: true,
              },
            })
          : await tx.referral_agents.update({
              where: { id: state.agents[0].id },
              data: { referral_code: code },
            });
        await tx.$executeRaw`
          INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, old_value, new_value, reason)
          VALUES (${actorId}, 'manager_regularization_referral', 'referral_agent', ${agent.id},
            ${JSON.stringify({ referralCode: null })}::jsonb,
            ${JSON.stringify({ runId, adminId: item.adminId, referralCode: code, created: item.referral === 'create_agent' })}::jsonb,
            ${reason.trim()})
        `;
      }
    }
    const after = await report(tx, selected);
    await tx.$executeRaw`
      INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, old_value, new_value, reason)
      VALUES (${actorId}, 'manager_regularization_run', 'manager_regularization', ${runId},
        ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb, ${reason.trim()})
    `;
    return { runId, before, after };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
}
