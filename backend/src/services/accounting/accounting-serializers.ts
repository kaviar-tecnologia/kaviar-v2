function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeAdminSummary(admin: any) {
  if (!admin) return null;
  return { id: admin.id, name: admin.name, role: admin.role };
}

function maskCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  if (cpf.length < 2) return '***.***.***-**';
  const last2 = cpf.slice(-2);
  return `***.***.***-${last2}`;
}

// ── Legal Entity ─────────────────────────────────────────────────────────────

export function serializeLegalEntity(entity: any) {
  return {
    id: entity.id,
    razao_social: entity.razao_social,
    nome_fantasia: entity.nome_fantasia ?? null,
    cnpj: entity.cnpj,
    entity_type: entity.entity_type,
    parent_entity_id: entity.parent_entity_id ?? null,
    uf: entity.uf ?? null,
    municipio: entity.municipio ?? null,
    endereco: entity.endereco ?? null,
    is_active: entity.is_active,
    created_at: toIso(entity.created_at),
    updated_at: toIso(entity.updated_at),
    parent: entity.parent ? serializeLegalEntitySummary(entity.parent) : undefined,
    children_count: entity._count?.children ?? undefined,
  };
}

export function serializeLegalEntitySummary(entity: any) {
  if (!entity) return null;
  return {
    id: entity.id,
    razao_social: entity.razao_social,
    cnpj: entity.cnpj,
    entity_type: entity.entity_type,
  };
}

// ── Accounting Firm ──────────────────────────────────────────────────────────

export function serializeAccountingFirm(firm: any) {
  return {
    id: firm.id,
    razao_social: firm.razao_social,
    nome_fantasia: firm.nome_fantasia ?? null,
    document_type: firm.document_type,
    document_number: firm.document_number,
    crc: firm.crc ?? null,
    crc_uf: firm.crc_uf ?? null,
    email: firm.email,
    telefone: firm.telefone ?? null,
    is_active: firm.is_active,
    created_at: toIso(firm.created_at),
    updated_at: toIso(firm.updated_at),
    accountants_count: firm._count?.accountants ?? undefined,
  };
}

export function serializeAccountingFirmSummary(firm: any) {
  if (!firm) return null;
  return {
    id: firm.id,
    razao_social: firm.razao_social,
    document_number: firm.document_number,
  };
}

// ── Accountant ───────────────────────────────────────────────────────────────

/** Used in list endpoints — CPF is masked */
export function serializeAccountantListItem(accountant: any) {
  return {
    id: accountant.id,
    accounting_firm_id: accountant.accounting_firm_id,
    nome_completo: accountant.nome_completo,
    email: accountant.email,
    cpf_masked: maskCpf(accountant.cpf),
    crc: accountant.crc ?? null,
    crc_uf: accountant.crc_uf ?? null,
    job_title: accountant.job_title ?? null,
    department: accountant.department ?? null,
    is_responsible_accountant: accountant.is_responsible_accountant ?? false,
    status: accountant.status,
    is_active: accountant.is_active,
    mfa_enabled: accountant.mfa_enabled,
    invited_at: toIso(accountant.invited_at),
    activated_at: toIso(accountant.activated_at),
    last_email_sent_at: toIso(accountant.invites?.[0]?.last_email_sent_at),
    last_email_status: accountant.invites?.[0]?.last_email_status ?? null,
    last_access_at: toIso(accountant.last_access_at),
    created_at: toIso(accountant.created_at),
    updated_at: toIso(accountant.updated_at),
    firm: accountant.firm ? serializeAccountingFirmSummary(accountant.firm) : undefined,
  };
}

/** Used in detail endpoint — full CPF (SUPER_ADMIN only) */
export function serializeAccountantDetail(accountant: any) {
  return {
    id: accountant.id,
    accounting_firm_id: accountant.accounting_firm_id,
    nome_completo: accountant.nome_completo,
    email: accountant.email,
    cpf: accountant.cpf,
    crc: accountant.crc ?? null,
    crc_uf: accountant.crc_uf ?? null,
    job_title: accountant.job_title ?? null,
    department: accountant.department ?? null,
    is_responsible_accountant: accountant.is_responsible_accountant ?? false,
    status: accountant.status,
    is_active: accountant.is_active,
    mfa_enabled: accountant.mfa_enabled,
    invited_at: toIso(accountant.invited_at),
    activated_at: toIso(accountant.activated_at),
    last_access_at: toIso(accountant.last_access_at),
    created_at: toIso(accountant.created_at),
    updated_at: toIso(accountant.updated_at),
    firm: accountant.firm ? serializeAccountingFirmSummary(accountant.firm) : undefined,
  };
}

/** @deprecated Use serializeAccountantListItem or serializeAccountantDetail */
export function serializeAccountant(accountant: any) {
  return serializeAccountantDetail(accountant);
}

// ── Accountant Invite ────────────────────────────────────────────────────────

export function serializeAccountantInvite(invite: any) {
  return {
    id: invite.id,
    accountant_id: invite.accountant_id,
    status: invite.status,
    expires_at: toIso(invite.expires_at),
    accepted_at: toIso(invite.accepted_at),
    revoked_at: toIso(invite.revoked_at),
    created_by_admin: serializeAdminSummary(invite.created_by_admin),
    created_at: toIso(invite.created_at),
  };
}

// ── Accountant Entity Link ───────────────────────────────────────────────────

export function serializeAccountantLink(link: any) {
  return {
    id: link.id,
    accountant_id: link.accountant_id,
    legal_entity_id: link.legal_entity_id,
    scope: link.scope,
    can_view: link.can_view,
    can_upload: link.can_upload,
    can_download: link.can_download,
    can_request_correction: link.can_request_correction,
    can_mark_processed: link.can_mark_processed,
    can_close_period: link.can_close_period,
    inherits_children: link.inherits_children,
    starts_at: toIso(link.starts_at),
    ends_at: toIso(link.ends_at),
    status: link.status,
    created_by_admin: serializeAdminSummary(link.created_by_admin),
    created_at: toIso(link.created_at),
    updated_at: toIso(link.updated_at),
    accountant: link.accountant ? { id: link.accountant.id, nome_completo: link.accountant.nome_completo } : undefined,
    legal_entity: link.legal_entity ? serializeLegalEntitySummary(link.legal_entity) : undefined,
  };
}
