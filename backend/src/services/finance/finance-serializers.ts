function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toBigIntString(value: bigint | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

export function serializeAdminSummary(admin: any) {
  if (!admin) return null;
  return {
    id: admin.id,
    name: admin.name,
    role: admin.role,
  };
}

export function serializeAccountSummary(account: any) {
  if (!account) return null;
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    is_active: account.is_active,
  };
}

export function serializeAccountItem(account: any) {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    institution_name: account.institution_name ?? null,
    bank_code: account.bank_code ?? null,
    currency: account.currency,
    opening_balance_cents: toBigIntString(account.opening_balance_cents),
    opening_balance_date: toIsoDate(account.opening_balance_date),
    allows_negative_balance: account.allows_negative_balance,
    is_cash_equivalent: account.is_cash_equivalent,
    is_active: account.is_active,
    notes: account.notes ?? null,
    created_by_admin: serializeAdminSummary(account.created_by_admin),
    updated_by_admin: serializeAdminSummary(account.updated_by_admin),
    created_at: toIsoDate(account.created_at),
    updated_at: toIsoDate(account.updated_at),
  };
}

export function serializeAccountDetail(account: any) {
  return serializeAccountItem(account);
}

export function serializeCategorySummary(category: any) {
  if (!category) return null;
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    kind: category.kind,
    is_active: category.is_active,
    is_postable: category.is_postable,
    sort_order: category.sort_order,
  };
}

export function serializeCategoryItem(category: any) {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    kind: category.kind,
    parent_id: category.parent_id ?? null,
    default_direction: category.default_direction ?? null,
    requires_document: category.requires_document,
    is_system: category.is_system,
    is_active: category.is_active,
    is_postable: category.is_postable,
    sort_order: category.sort_order,
    created_by_admin: serializeAdminSummary(category.created_by_admin),
    updated_by_admin: serializeAdminSummary(category.updated_by_admin),
    created_at: toIsoDate(category.created_at),
    updated_at: toIsoDate(category.updated_at),
  };
}

export function serializeCategoryListItem(category: any) {
  return {
    ...serializeCategoryItem(category),
    parent: serializeCategorySummary(category.parent),
    children_count: category._count?.children ?? 0,
  };
}

export function serializeCategoryDetail(category: any) {
  return {
    ...serializeCategoryItem(category),
    parent: serializeCategorySummary(category.parent),
    children: Array.isArray(category.children) ? category.children.map(serializeCategorySummary) : [],
  };
}

export function serializeTerritorySummary(territory: any) {
  if (!territory) return null;
  return {
    id: territory.id,
    name: territory.name,
    status: territory.status ?? null,
  };
}

export function serializeCostCenterSummary(costCenter: any) {
  if (!costCenter) return null;
  return {
    id: costCenter.id,
    code: costCenter.code,
    name: costCenter.name,
    type: costCenter.type,
    is_active: costCenter.is_active,
  };
}

export function serializeCostCenterItem(costCenter: any) {
  return {
    id: costCenter.id,
    code: costCenter.code,
    name: costCenter.name,
    type: costCenter.type,
    parent_id: costCenter.parent_id ?? null,
    territory_id: costCenter.territory_id ?? null,
    city: costCenter.city ?? null,
    state: costCenter.state ?? null,
    is_active: costCenter.is_active,
    created_by_admin: serializeAdminSummary(costCenter.created_by_admin),
    updated_by_admin: serializeAdminSummary(costCenter.updated_by_admin),
    created_at: toIsoDate(costCenter.created_at),
    updated_at: toIsoDate(costCenter.updated_at),
  };
}

export function serializeCostCenterListItem(costCenter: any) {
  return {
    ...serializeCostCenterItem(costCenter),
    parent: serializeCostCenterSummary(costCenter.parent),
    territory: serializeTerritorySummary(costCenter.territory),
    children_count: costCenter._count?.children ?? 0,
  };
}

export function serializeCostCenterDetail(costCenter: any) {
  return {
    ...serializeCostCenterItem(costCenter),
    parent: serializeCostCenterSummary(costCenter.parent),
    territory: serializeTerritorySummary(costCenter.territory),
    children: Array.isArray(costCenter.children) ? costCenter.children.map(serializeCostCenterSummary) : [],
  };
}

export function serializeRecognitionPolicyItem(policy: any) {
  return {
    id: policy.id,
    code: policy.code,
    subject: policy.subject,
    scope_type: policy.scope_type,
    territory_id: policy.territory_id ?? null,
    cost_center_id: policy.cost_center_id ?? null,
    city: policy.city ?? null,
    state: policy.state ?? null,
    policy: policy.policy,
    status: policy.status,
    effective_from: toIsoDate(policy.effective_from),
    effective_until: toIsoDate(policy.effective_until),
    approved_by_admin: serializeAdminSummary(policy.approved_by_admin),
    approved_at: toIsoDate(policy.approved_at),
    reason: policy.reason,
    notes: policy.notes ?? null,
    created_by_admin: serializeAdminSummary(policy.created_by_admin),
    updated_by_admin: serializeAdminSummary(policy.updated_by_admin),
    created_at: toIsoDate(policy.created_at),
    updated_at: toIsoDate(policy.updated_at),
  };
}

export function serializeRecognitionPolicyListItem(policy: any) {
  return {
    ...serializeRecognitionPolicyItem(policy),
    territory: serializeTerritorySummary(policy.territory),
    cost_center: serializeCostCenterSummary(policy.cost_center),
  };
}

export function serializeRecognitionPolicyDetail(policy: any) {
  return {
    ...serializeRecognitionPolicyItem(policy),
    territory: serializeTerritorySummary(policy.territory),
    cost_center: serializeCostCenterSummary(policy.cost_center),
  };
}

export function serializeTransactionSummary(transaction: any) {
  if (!transaction) return null;
  return {
    id: transaction.id,
    description: transaction.description,
    transaction_type: transaction.transaction_type,
    status: transaction.status,
    transaction_date: toIsoDate(transaction.transaction_date),
    gross_amount_cents: toBigIntString(transaction.gross_amount_cents),
    net_amount_cents: toBigIntString(transaction.net_amount_cents),
  };
}

export function serializeTransactionAllocation(allocation: any) {
  return {
    id: allocation.id,
    transaction_id: allocation.transaction_id,
    category_id: allocation.category_id,
    cost_center_id: allocation.cost_center_id ?? null,
    amount_cents: toBigIntString(allocation.amount_cents),
    allocation_type: allocation.allocation_type,
    description: allocation.description ?? null,
    metadata: allocation.metadata ?? null,
    created_by_admin: serializeAdminSummary(allocation.created_by_admin),
    created_at: toIsoDate(allocation.created_at),
    updated_at: toIsoDate(allocation.updated_at),
    category: serializeCategorySummary(allocation.category),
    cost_center: serializeCostCenterSummary(allocation.cost_center),
  };
}

export function serializeTransactionLink(link: any, linkedTransaction: any) {
  return {
    id: link.id,
    transaction_id: link.transaction_id,
    linked_transaction_id: link.linked_transaction_id,
    link_type: link.link_type,
    amount_cents: toBigIntString(link.amount_cents),
    metadata: link.metadata ?? null,
    created_by_admin: serializeAdminSummary(link.created_by_admin),
    created_at: toIsoDate(link.created_at),
    updated_at: toIsoDate(link.updated_at),
    linked_transaction: serializeTransactionSummary(linkedTransaction),
  };
}

export function serializeTransactionItem(transaction: any) {
  return {
    id: transaction.id,
    description: transaction.description,
    direction: transaction.direction,
    transaction_type: transaction.transaction_type,
    status: transaction.status,
    payment_method: transaction.payment_method ?? null,
    source_type: transaction.source_type,
    source_id: transaction.source_id ?? null,
    origin_type: transaction.origin_type,
    origin_id: transaction.origin_id ?? null,
    reversal_of_id: transaction.reversal_of_id ?? null,
    account: serializeAccountSummary(transaction.account),
    counterparty_account: serializeAccountSummary(transaction.counterparty_account),
    category: serializeCategorySummary(transaction.category),
    cost_center: serializeCostCenterSummary(transaction.cost_center),
    competence_date: toIsoDate(transaction.competence_date),
    transaction_date: toIsoDate(transaction.transaction_date),
    due_date: toIsoDate(transaction.due_date),
    settlement_date: toIsoDate(transaction.settlement_date),
    gross_amount_cents: toBigIntString(transaction.gross_amount_cents),
    fee_amount_cents: toBigIntString(transaction.fee_amount_cents),
    discount_amount_cents: toBigIntString(transaction.discount_amount_cents),
    retention_amount_cents: toBigIntString(transaction.retention_amount_cents),
    net_amount_cents: toBigIntString(transaction.net_amount_cents),
    transfer_amount_cents: toBigIntString(transaction.transfer_amount_cents),
    created_at: toIsoDate(transaction.created_at),
    updated_at: toIsoDate(transaction.updated_at),
  };
}

export function serializeTransactionDetail(transaction: any) {
  return {
    id: transaction.id,
    external_reference: transaction.external_reference ?? null,
    provider: transaction.provider ?? null,
    provider_event_id: transaction.provider_event_id ?? null,
    source_type: transaction.source_type,
    source_id: transaction.source_id ?? null,
    origin_type: transaction.origin_type,
    origin_id: transaction.origin_id ?? null,
    account_id: transaction.account_id,
    counterparty_account_id: transaction.counterparty_account_id ?? null,
    category_id: transaction.category_id ?? null,
    cost_center_id: transaction.cost_center_id ?? null,
    transfer_group_id: transaction.transfer_group_id ?? null,
    direction: transaction.direction,
    transaction_type: transaction.transaction_type,
    status: transaction.status,
    payment_method: transaction.payment_method ?? null,
    recognition_policy: transaction.recognition_policy ?? null,
    competence_date: toIsoDate(transaction.competence_date),
    transaction_date: toIsoDate(transaction.transaction_date),
    due_date: toIsoDate(transaction.due_date),
    settlement_date: toIsoDate(transaction.settlement_date),
    gross_amount_cents: toBigIntString(transaction.gross_amount_cents),
    fee_amount_cents: toBigIntString(transaction.fee_amount_cents),
    discount_amount_cents: toBigIntString(transaction.discount_amount_cents),
    retention_amount_cents: toBigIntString(transaction.retention_amount_cents),
    net_amount_cents: toBigIntString(transaction.net_amount_cents),
    transfer_amount_cents: toBigIntString(transaction.transfer_amount_cents),
    reversal_of_id: transaction.reversal_of_id ?? null,
    canceled_reason: transaction.canceled_reason ?? null,
    canceled_at: toIsoDate(transaction.canceled_at),
    description: transaction.description,
    memo: transaction.memo ?? null,
    metadata: transaction.metadata ?? null,
    idempotency_key: transaction.idempotency_key ?? null,
    created_by_admin_id: transaction.created_by_admin_id ?? null,
    approved_by_admin_id: transaction.approved_by_admin_id ?? null,
    responsible_admin_id: transaction.responsible_admin_id ?? null,
    created_at: toIsoDate(transaction.created_at),
    updated_at: toIsoDate(transaction.updated_at),
    account: serializeAccountSummary(transaction.account),
    counterparty_account: serializeAccountSummary(transaction.counterparty_account),
    category: serializeCategorySummary(transaction.category),
    cost_center: serializeCostCenterSummary(transaction.cost_center),
    reversal_of: serializeTransactionSummary(transaction.reversal_of),
    reversals: Array.isArray(transaction.reversals) ? transaction.reversals.map(serializeTransactionSummary) : [],
    allocations: Array.isArray(transaction.allocations)
      ? transaction.allocations.map((allocation: any) => serializeTransactionAllocation(allocation))
      : [],
    outgoing_links: Array.isArray(transaction.outgoing_links)
      ? transaction.outgoing_links.map((link: any) => serializeTransactionLink(link, link.linked_transaction))
      : [],
    incoming_links: Array.isArray(transaction.incoming_links)
      ? transaction.incoming_links.map((link: any) => serializeTransactionLink(link, link.transaction))
      : [],
    created_by_admin: serializeAdminSummary(transaction.created_by_admin),
    approved_by_admin: serializeAdminSummary(transaction.approved_by_admin),
    responsible_admin: serializeAdminSummary(transaction.responsible_admin),
  };
}
