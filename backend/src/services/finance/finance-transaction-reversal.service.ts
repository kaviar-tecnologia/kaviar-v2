/**
 * Finance Transaction Reversal Service
 * Atomic: prisma.$transaction ensures original→REVERSED + create REVERSAL or rollback.
 */
import { prisma } from '../../lib/prisma';
import type { FinanceTransactionReverseBody } from './finance-transaction-reversal-validation';
import { TransactionWriteError } from './finance-transaction-crud.service';

export async function reverseFinanceTransaction(
  id: string,
  body: FinanceTransactionReverseBody,
  admin: { id: string; email: string; role: string },
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Load original inside transaction
    const original = await tx.financial_transactions.findUnique({
      where: { id },
      select: {
        id: true, source_type: true, status: true, direction: true,
        transaction_type: true, account_id: true, counterparty_account_id: true,
        category_id: true, cost_center_id: true, payment_method: true,
        gross_amount_cents: true, fee_amount_cents: true, discount_amount_cents: true,
        retention_amount_cents: true, net_amount_cents: true,
        description: true, memo: true, metadata: true,
        competence_date: true, transaction_date: true, due_date: true, settlement_date: true,
        updated_at: true,
        reversals: { select: { id: true }, take: 1 },
      },
    });

    if (!original) throw new TransactionWriteError('Lançamento não encontrado', 404);
    if (original.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser estornados', 403);
    if (original.status !== 'POSTED') throw new TransactionWriteError(`Somente lançamentos liquidados (POSTED) podem ser estornados. Status atual: ${original.status}`);
    if (original.reversals && original.reversals.length > 0) throw new TransactionWriteError('Este lançamento já possui um estorno', 409);

    // Validate dates
    if (body.reversal_date < original.transaction_date) {
      throw new TransactionWriteError('reversal_date não pode ser anterior a transaction_date');
    }
    if (original.settlement_date && body.reversal_date < original.settlement_date) {
      throw new TransactionWriteError('reversal_date não pode ser anterior a settlement_date');
    }

    // 2. CAS: mark original as REVERSED
    const casResult = await tx.financial_transactions.updateMany({
      where: {
        id: original.id,
        source_type: 'MANUAL',
        status: 'POSTED' as any,
        updated_at: body.expected_updated_at,
      },
      data: { status: 'REVERSED' },
    });

    if (casResult.count === 0) {
      throw new TransactionWriteError('Conflito de atualização: o registro foi alterado por outra sessão', 409);
    }

    // 3. Create reversal entry
    const reversedDirection = original.direction === 'IN' ? 'OUT' : 'IN';
    const desc = `Estorno: ${original.description}`.slice(0, 500);
    const idempotencyKey = `finance-reversal:${original.id}`;

    const reversal = await tx.financial_transactions.create({
      data: {
        source_type: 'MANUAL',
        origin_type: 'MANUAL',
        source_id: original.id,
        origin_id: original.id,
        reversal_of_id: original.id,
        idempotency_key: idempotencyKey,
        account_id: original.account_id,
        counterparty_account_id: original.counterparty_account_id,
        category_id: original.category_id,
        cost_center_id: original.cost_center_id,
        direction: reversedDirection as any,
        transaction_type: 'REVERSAL' as any,
        status: 'POSTED' as any,
        payment_method: 'INTERNAL' as any,
        competence_date: body.reversal_date,
        transaction_date: body.reversal_date,
        settlement_date: body.reversal_date,
        due_date: null,
        gross_amount_cents: original.gross_amount_cents,
        fee_amount_cents: original.fee_amount_cents,
        discount_amount_cents: original.discount_amount_cents,
        retention_amount_cents: original.retention_amount_cents,
        net_amount_cents: original.net_amount_cents,
        description: desc,
        memo: body.reason,
        metadata: original.metadata ? JSON.parse(JSON.stringify(original.metadata)) : undefined,
        created_by_admin_id: admin.id,
        approved_by_admin_id: admin.id,
        responsible_admin_id: admin.id,
      },
      select: { id: true },
    });

    // 4. Reload both
    const updatedOriginal = await tx.financial_transactions.findUnique({ where: { id: original.id } });
    const createdReversal = await tx.financial_transactions.findUnique({ where: { id: reversal.id } });

    return { original: updatedOriginal, reversal: createdReversal };
  });

  return {
    original: result.original,
    reversal: result.reversal,
    auditBefore: { id, status: 'POSTED' },
    auditAfter: { id, status: 'REVERSED', reversal_id: result.reversal?.id, reason: body.reason, reversal_date: body.reversal_date },
  };
}
