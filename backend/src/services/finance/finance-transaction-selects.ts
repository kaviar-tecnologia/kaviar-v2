/**
 * Shared Prisma select constants for financial transactions.
 * Used by: getFinanceTransactionById, reverseFinanceTransaction, CRUD detail returns.
 */

const TRANSACTION_SUMMARY_SELECT = {
  id: true, description: true, transaction_type: true, status: true,
  transaction_date: true, gross_amount_cents: true, net_amount_cents: true, direction: true,
};

export const FINANCE_TRANSACTION_DETAIL_SELECT = {
  id: true, external_reference: true, source_type: true, source_id: true,
  origin_type: true, origin_id: true, provider: true, provider_event_id: true,
  account_id: true, counterparty_account_id: true, category_id: true, cost_center_id: true,
  transfer_group_id: true, recognition_policy: true,
  direction: true, transaction_type: true, status: true, payment_method: true,
  competence_date: true, transaction_date: true, due_date: true, settlement_date: true,
  gross_amount_cents: true, fee_amount_cents: true, discount_amount_cents: true,
  retention_amount_cents: true, net_amount_cents: true, transfer_amount_cents: true,
  reversal_of_id: true, canceled_reason: true, canceled_at: true,
  description: true, memo: true, metadata: true, idempotency_key: true,
  created_by_admin_id: true, approved_by_admin_id: true, responsible_admin_id: true,
  created_at: true, updated_at: true,
  account: { select: { id: true, code: true, name: true, type: true, is_active: true } },
  counterparty_account: { select: { id: true, code: true, name: true, type: true, is_active: true } },
  category: { select: { id: true, code: true, name: true, kind: true, is_active: true, is_postable: true } },
  cost_center: { select: { id: true, code: true, name: true, type: true, is_active: true } },
  reversal_of: { select: TRANSACTION_SUMMARY_SELECT },
  reversals: { select: TRANSACTION_SUMMARY_SELECT },
  created_by_admin: { select: { id: true, name: true, role: true } },
  approved_by_admin: { select: { id: true, name: true, role: true } },
  responsible_admin: { select: { id: true, name: true, role: true } },
  allocations: {
    select: {
      id: true, amount_cents: true, description: true, created_at: true,
      category: { select: { id: true, code: true, name: true } },
      cost_center: { select: { id: true, code: true, name: true } },
      created_by_admin: { select: { id: true, name: true } },
    },
  },
  outgoing_links: {
    select: {
      id: true, link_type: true, description: true, created_at: true,
      linked_transaction: { select: TRANSACTION_SUMMARY_SELECT },
      created_by_admin: { select: { id: true, name: true } },
    },
  },
  incoming_links: {
    select: {
      id: true, link_type: true, description: true, created_at: true,
      transaction: { select: TRANSACTION_SUMMARY_SELECT },
      created_by_admin: { select: { id: true, name: true } },
    },
  },
};
