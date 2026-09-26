/**
 * PR #403: read-only preview, never persists a statement, credits a wallet,
 * links a ledger entry, changes a status, or calls a provider.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import {
  parseNormalizedStatement, previewStatement, StatementPreviewError,
} from '../services/finance/reconciliation-preview.service';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

const previewSchema = z.object({
  provider: z.enum(['SUMUP', 'ASAAS']),
  account_id: z.string().uuid(),
  legal_entity_id: z.string().uuid(),
  csv: z.string().min(1).max(65_536),
}).strict();

router.post('/preview', async (req: Request, res: Response) => {
  const role = (req as any).admin?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_PREVIEW_REQUEST' });
  }

  let rows: ReturnType<typeof parseNormalizedStatement>;
  try {
    rows = parseNormalizedStatement(parsed.data.csv);
  } catch (err) {
    if (err instanceof StatementPreviewError) {
      return res.status(400).json({ success: false, error: err.code });
    }
    return res.status(400).json({ success: false, error: 'CSV_INVALID' });
  }

  try {
    const { provider, account_id, legal_entity_id, csv } = parsed.data;
    // Never scope a statement by a client-supplied label alone: account must
    // be active, BRL, and formally assigned to this exact legal entity.
    const account = await prisma.financial_accounts.findFirst({
      where: {
        id: account_id, legal_entity_id, is_active: true, currency: 'BRL',
        type: { in: ['BANK', 'PIX_WALLET', 'CLEARING'] },
      },
      select: { id: true },
    });
    if (!account) {
      return res.status(404).json({ success: false, error: 'FINANCIAL_ACCOUNT_SCOPE_NOT_VERIFIED' });
    }

    const refs = [...new Set(rows.map((r) => r.externalReference).filter(
      (ref): ref is string => !!ref,
    ))];
    const ledger = refs.length ? await prisma.financial_transactions.findMany({
      where: {
        account_id, legal_entity_id,
        provider: { equals: provider, mode: 'insensitive' },
        external_reference: { in: refs },
        status: { in: ['POSTED', 'RECONCILED', 'CLOSED'] },
      },
      select: {
        id: true, external_reference: true, direction: true,
        net_amount_cents: true, status: true,
      },
    }) : [];

    // No CSV body, provider keys, destination or bank identifiers in response/logs.
    const preview = previewStatement(csv, rows, ledger);
    return res.json({
      success: true,
      data: { provider, account_id, legal_entity_id, ...preview },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'PREVIEW_UNAVAILABLE' });
  }
});

export default router;
