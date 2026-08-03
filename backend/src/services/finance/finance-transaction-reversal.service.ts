/**
 * Finance Transaction Reversal Service
 * Atomic: prisma.$transaction ensures original→REVERSED + create REVERSAL + audit or rollback.
 * Prevents: reversal of reversal, double reversal, non-POSTED, non-MANUAL.
 */
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import type { FinanceTransactionReverseBody } from './finance-transaction-reversal-validation';
import { TransactionWriteError } from './finance-transaction-crud.service';
import { FINANCE_TRANSACTION_DETAIL_SELECT } from './finance-transaction-selects';
import { writeFinanceTransactionAuditTx, FinanceTransactionAuditContext } from './finance-transaction-audit';

export async function reverseFinanceTransaction(
  id: string,
  body: FinanceTransactionReverseBody,
  admin: { id: string; email: string; role: string },
  auditContext: FinanceTransactionAuditContext,
) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Load original with reversal info
      const original = await tx.financial_transactions.findUnique({
        where: { id },
        select: {
          id: true, source_type: true, status: true, direction: true,
          transaction_type: true, reversal_of_id: true,
          account_id: true, counterparty_account_id: true,
          category_id: true, cost_center_id: true, payment_method: true,
          gross_amount_cents: true, fee_amount_cents: true, discount_amount_cents: true,
          retention_amount_cents: true, net_amount_cents: true,
          description: true, memo: true, metadata: true,
          competence_date: true, transaction_date: true, due_date: true, settlement_date: true,
          updated_at: true,
          reversals: { select: { id: true }, take: 1 },
        },
      });

      // Validation order per spec:
      // 1. exists
      if (!original) throw new TransactionWriteError('Lançamento não encontrado', 404);
      // 2. source_type
      if (original.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser estornados', 403);
      // 3. already reversed
      if (original.status === 'REVERSED' || (original.reversals && original.reversals.length > 0)) {
        throw new TransactionWriteError('Este lançamento já possui um estorno', 409);
      }
      // 4. is itself a reversal
      if (original.transaction_type === 'REVERSAL' || original.reversal_of_id !== null) {
        throw new TransactionWriteError('Um lançamento de estorno não pode ser estornado novamente nesta versão', 409);
      }
      // 5. must be POSTED
      if (original.status !== 'POSTED') {
        throw new TransactionWriteError(`Somente lançamentos liquidados (POSTED) podem ser estornados. Status atual: ${original.status}`);
      }

      // 6. Date validations
      if (body.reversal_date < original.transaction_date) {
        throw new TransactionWriteError('reversal_date não pode ser anterior a transaction_date');
      }
      if (original.settlement_date && body.reversal_date < original.settlement_date) {
        throw new TransactionWriteError('reversal_date não pode ser anterior a settlement_date');
      }

      // 7. CAS: mark original as REVERSED
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

      // 8. Create reversal entry
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

      // 9. Reload with full relations
      const updatedOriginal = await tx.financial_transactions.findUnique({ where: { id: original.id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });
      const createdReversal = await tx.financial_transactions.findUnique({ where: { id: reversal.id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });

      if (!updatedOriginal) {
        throw new Error('Lançamento financeiro não pôde ser recarregado após estorno');
      }
      if (!createdReversal) {
        throw new Error('Lançamento de estorno não pôde ser recarregado após criação');
      }

      // 10. Atomic audit
      await writeFinanceTransactionAuditTx(tx, auditContext, {
        action: 'FINANCE_TRANSACTION_REVERSE',
        entityType: 'financial_transactions',
        entityId: id,
        oldValue: {
          original_transaction_id: id,
          original_status_before: 'POSTED',
          expected_updated_at: body.expected_updated_at,
        },
        newValue: {
          original_transaction_id: id,
          original_status_after: 'REVERSED',
          reversal_transaction_id: createdReversal?.id,
          reversal_of_id: id,
          reversal_direction: createdReversal?.direction,
          reversal_transaction_type: 'REVERSAL',
          gross_amount_cents: createdReversal?.gross_amount_cents?.toString(),
          net_amount_cents: createdReversal?.net_amount_cents?.toString(),
          fee_amount_cents: createdReversal?.fee_amount_cents?.toString(),
          discount_amount_cents: createdReversal?.discount_amount_cents?.toString(),
          retention_amount_cents: createdReversal?.retention_amount_cents?.toString(),
          account_id: createdReversal?.account_id,
          category_id: createdReversal?.category_id,
          reversal_date: body.reversal_date.toISOString(),
          admin_id: admin.id,
        },
        reason: body.reason,
      });

      return { original: updatedOriginal, reversal: createdReversal };
    });

    return { original: result.original, reversal: result.reversal };
  } catch (error) {
    // Handle P2002 unique constraint ONLY for idempotency_key
    if (isIdempotencyKeyConflict(error)) {
      throw new TransactionWriteError('Este lançamento já possui um estorno', 409);
    }
    throw error;
  }
}

function isIdempotencyKeyConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.some((field) => String(field).includes('idempotency_key'));
  }
  return String(target ?? '').includes('idempotency_key');
}
