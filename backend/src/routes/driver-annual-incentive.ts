/**
 * Driver Annual Incentive Routes.
 *
 * Endpoints:
 *   GET  /summary           — balance summary
 *   GET  /statement         — ledger events (paginated)
 *   GET  /requests          — request history
 *   GET  /requests/:id      — request detail
 *   GET  /payout-destination — current destination (masked)
 *   PUT  /payout-destination — set/replace destination
 *   POST /requests          — create payout request
 */

import { Router, Request, Response } from 'express';
import { authenticateDriver } from '../middlewares/auth';
import { projectBalance } from '../services/finance/annual-incentive-payout/balance-projection';
import { getWindowInfo } from '../services/finance/annual-incentive-payout/request-window';
import {
  getActiveDestination,
  setDestination,
  toPublicDestination,
} from '../services/finance/annual-incentive-payout/destination.service';
import {
  createRequest,
  listDriverRequests,
  getRequestById,
  getRequestAllocations,
  getOpenRequest,
} from '../services/finance/annual-incentive-payout/request.service';
import { PAYOUT_ERRORS } from '../services/finance/annual-incentive-payout/types';
import { AnnualIncentiveLedgerService } from '../services/finance/annual-incentive-ledger.service';
import { pool } from '../db';

const router = Router();
router.use(authenticateDriver);

const ledgerService = new AnnualIncentiveLedgerService(pool);

// GET /summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id;
    const balance = await projectBalance(pool, driverId);
    const windowInfo = getWindowInfo();
    const openRequest = await getOpenRequest(pool, driverId);

    res.json({
      success: true,
      data: {
        totalAccruedCents: balance.totalAccruedCents.toString(),
        totalAvailableCents: balance.totalAvailableCents.toString(),
        totalReservedCents: balance.totalOpenReservedCents.toString(),
        totalPaidCents: balance.totalPaidCents.toString(),
        totalReversedCents: balance.totalReversedCents.toString(),
        byYear: balance.byYear.map(y => ({
          programYear: y.programYear,
          accruedCents: y.accruedCents.toString(),
          availableCents: y.availableCents.toString(),
          reservedCents: y.openReservedCents.toString(),
          paidCents: y.paidCents.toString(),
          reversedCents: y.reversedCents.toString(),
        })),
        requestWindow: windowInfo,
        hasOpenRequest: !!openRequest,
        openRequestId: openRequest?.id ?? null,
      },
    });
  } catch (err: any) {
    console.error('[ANNUAL_INCENTIVE_SUMMARY_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /statement
router.get('/statement', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const afterId = req.query.afterId as string | undefined;
    const programYear = req.query.programYear ? parseInt(req.query.programYear as string) : undefined;

    const { rows } = await pool.query(
      `SELECT id, program_year, event_type, amount_cents, source_type, occurred_at, created_at
       FROM annual_incentive_ledger
       WHERE driver_id = $1
         ${programYear ? 'AND program_year = $4' : ''}
         ${afterId ? 'AND id < $5' : ''}
       ORDER BY occurred_at DESC, created_at DESC
       LIMIT $2`,
      [driverId, limit, ...(programYear ? [programYear] : []), ...(afterId ? [afterId] : [])]
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        programYear: r.program_year,
        eventType: r.event_type,
        amountCents: r.amount_cents.toString(),
        sourceType: r.source_type,
        occurredAt: r.occurred_at,
      })),
    });
  } catch (err: any) {
    console.error('[ANNUAL_INCENTIVE_STATEMENT_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /requests
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const requests = await listDriverRequests(pool, driverId, limit, offset);

    res.json({
      success: true,
      data: requests.map(r => ({
        id: r.id,
        requestedAmountCents: r.requestedAmountCents.toString(),
        status: r.status,
        destinationMasked: r.destinationMasked,
        requestedAt: r.requestedAt,
        paidAt: r.paidAt,
        failureCode: r.failureCode,
        failureMessageSafe: r.failureMessageSafe,
        deadlineAt: r.deadlineAt,
      })),
    });
  } catch (err: any) {
    console.error('[ANNUAL_INCENTIVE_REQUESTS_LIST_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /requests/:id
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id;
    const request = await getRequestById(pool, req.params.id);

    if (!request || request.driverId !== driverId) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    }

    const allocations = await getRequestAllocations(pool, request.id);

    res.json({
      success: true,
      data: {
        id: request.id,
        requestedAmountCents: request.requestedAmountCents.toString(),
        status: request.status,
        destinationMasked: request.destinationMasked,
        requestedAt: request.requestedAt,
        reservedAt: request.reservedAt,
        paidAt: request.paidAt,
        failureCode: request.failureCode,
        failureMessageSafe: request.failureMessageSafe,
        deadlineAt: request.deadlineAt,
        allocations: allocations.map(a => ({
          programYear: a.programYear,
          amountCents: a.amountCents.toString(),
        })),
      },
    });
  } catch (err: any) {
    console.error('[ANNUAL_INCENTIVE_REQUEST_DETAIL_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /payout-destination
router.get('/payout-destination', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id;
    const dest = await getActiveDestination(pool, driverId);

    if (!dest) {
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: toPublicDestination(dest) });
  } catch (err: any) {
    console.error('[ANNUAL_INCENTIVE_DESTINATION_GET_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// PUT /payout-destination
router.put('/payout-destination', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id;
    const { pixKeyType, pixKeyCpf } = req.body;

    if (!pixKeyType || pixKeyType !== 'CPF') {
      return res.status(400).json({ success: false, error: 'Only CPF pix key type is supported' });
    }
    if (!pixKeyCpf || typeof pixKeyCpf !== 'string') {
      return res.status(400).json({ success: false, error: 'pixKeyCpf is required' });
    }

    const dest = await setDestination(pool, { driverId, pixKeyType: 'CPF', pixKeyCpf });
    res.json({ success: true, data: toPublicDestination(dest) });
  } catch (err: any) {
    if (err.code === PAYOUT_ERRORS.CPF_MISMATCH) {
      return res.status(400).json({ success: false, error: err.code, message: 'CPF does not match your registered document' });
    }
    if (err.code === PAYOUT_ERRORS.CPF_NOT_VERIFIED) {
      return res.status(400).json({ success: false, error: err.code, message: 'CPF not registered' });
    }
    if (err.code === PAYOUT_ERRORS.DESTINATION_INVALID) {
      return res.status(400).json({ success: false, error: err.code, message: 'Invalid CPF format' });
    }
    console.error('[ANNUAL_INCENTIVE_DESTINATION_SET_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /requests
router.post('/requests', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id;
    const { amountCents, idempotencyKey } = req.body;

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({ success: false, error: 'idempotencyKey is required' });
    }
    if (!amountCents || typeof amountCents !== 'string') {
      return res.status(400).json({ success: false, error: 'amountCents is required (string)' });
    }

    let amount: bigint;
    try {
      amount = BigInt(amountCents);
    } catch {
      return res.status(400).json({ success: false, error: 'amountCents must be a valid integer string' });
    }

    const result = await createRequest(pool, ledgerService, {
      driverId,
      requestedAmountCents: amount,
      idempotencyKey,
    });

    const status = result.created ? 201 : 200;
    res.status(status).json({
      success: true,
      created: result.created,
      data: {
        id: result.request.id,
        requestedAmountCents: result.request.requestedAmountCents.toString(),
        status: result.request.status,
        destinationMasked: result.request.destinationMasked,
        requestedAt: result.request.requestedAt,
        deadlineAt: result.request.deadlineAt,
        allocations: result.allocations.map(a => ({
          programYear: a.programYear,
          amountCents: a.amountCents.toString(),
        })),
      },
    });
  } catch (err: any) {
    const knownErrors = [
      PAYOUT_ERRORS.WINDOW_CLOSED,
      PAYOUT_ERRORS.INSUFFICIENT_BALANCE,
      PAYOUT_ERRORS.INVALID_AMOUNT,
      PAYOUT_ERRORS.OPEN_REQUEST_EXISTS,
      PAYOUT_ERRORS.DESTINATION_NOT_FOUND,
      PAYOUT_ERRORS.DESTINATION_INVALID,
      PAYOUT_ERRORS.CPF_MISMATCH,
      PAYOUT_ERRORS.CPF_NOT_VERIFIED,
      PAYOUT_ERRORS.IDEMPOTENCY_CONFLICT,
    ];
    if (knownErrors.includes(err.code)) {
      const statusCode = err.code === PAYOUT_ERRORS.IDEMPOTENCY_CONFLICT ? 409 : 400;
      return res.status(statusCode).json({ success: false, error: err.code, message: err.message });
    }
    console.error('[ANNUAL_INCENTIVE_REQUEST_CREATE_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
