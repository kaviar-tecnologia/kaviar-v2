/**
 * Admin Annual Incentive Routes (read-only + safe operations).
 *
 * NO endpoint to mark as paid, register manual Pix, or create PAYMENT.
 *
 * Available:
 *   GET  /requests          — list requests (paginated, filterable)
 *   GET  /requests/:id      — request detail with allocations
 *   GET  /payouts           — list payouts
 *   GET  /payouts/:id       — payout detail with attempts
 *   GET  /health            — system health overview
 */

import { Router, Request, Response } from 'express';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { pool } from '../db';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

// GET /requests
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;
    const driverId = req.query.driverId as string | undefined;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      where += ` AND r.status = $${paramIdx++}`;
      params.push(status);
    }
    if (driverId) {
      where += ` AND r.driver_id = $${paramIdx++}`;
      params.push(driverId);
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.driver_id, r.requested_amount_cents, r.status,
              r.destination_masked, r.requested_at, r.paid_at, r.failed_at,
              r.deadline_at, r.failure_code, r.failure_message_safe,
              r.correlation_id, r.created_at
       FROM annual_incentive_requests r
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as total FROM annual_incentive_requests r ${where}`,
      params
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        driverId: r.driver_id,
        requestedAmountCents: r.requested_amount_cents.toString(),
        status: r.status,
        destinationMasked: r.destination_masked,
        requestedAt: r.requested_at,
        paidAt: r.paid_at,
        failedAt: r.failed_at,
        deadlineAt: r.deadline_at,
        failureCode: r.failure_code,
        failureMessageSafe: r.failure_message_safe,
        correlationId: r.correlation_id,
        createdAt: r.created_at,
      })),
      pagination: { total: parseInt(countRows[0].total), limit, offset },
    });
  } catch (err: any) {
    console.error('[ADMIN_ANNUAL_INCENTIVE_REQUESTS_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /requests/:id
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM annual_incentive_requests WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    }

    const r = rows[0];
    const { rows: allocations } = await pool.query(
      'SELECT program_year, amount_cents FROM annual_incentive_request_allocations WHERE request_id = $1 ORDER BY program_year',
      [r.id]
    );

    res.json({
      success: true,
      data: {
        id: r.id,
        driverId: r.driver_id,
        requestedAmountCents: r.requested_amount_cents.toString(),
        status: r.status,
        destinationMasked: r.destination_masked,
        destinationHash: r.destination_hash,
        requestedAt: r.requested_at,
        reservedAt: r.reserved_at,
        eligibilityCheckedAt: r.eligibility_checked_at,
        queuedAt: r.queued_at,
        paidAt: r.paid_at,
        failedAt: r.failed_at,
        releasedAt: r.released_at,
        deadlineAt: r.deadline_at,
        failureCode: r.failure_code,
        failureMessageSafe: r.failure_message_safe,
        correlationId: r.correlation_id,
        idempotencyKey: r.idempotency_key,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        allocations: allocations.map((a: any) => ({
          programYear: a.program_year,
          amountCents: a.amount_cents.toString(),
        })),
      },
    });
  } catch (err: any) {
    console.error('[ADMIN_ANNUAL_INCENTIVE_REQUEST_DETAIL_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /payouts
router.get('/payouts', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      where += ` AND p.status = $${paramIdx++}`;
      params.push(status);
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.request_id, p.driver_id, p.amount_cents, p.provider_name,
              p.provider_payout_id, p.external_reference, p.status, p.provider_status,
              p.submitted_at, p.confirmed_at, p.failed_at, p.created_at
       FROM annual_incentive_payouts p
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows.map(p => ({
        id: p.id,
        requestId: p.request_id,
        driverId: p.driver_id,
        amountCents: p.amount_cents.toString(),
        providerName: p.provider_name,
        providerPayoutId: p.provider_payout_id,
        externalReference: p.external_reference,
        status: p.status,
        providerStatus: p.provider_status,
        submittedAt: p.submitted_at,
        confirmedAt: p.confirmed_at,
        failedAt: p.failed_at,
        createdAt: p.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[ADMIN_ANNUAL_INCENTIVE_PAYOUTS_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /payouts/:id
router.get('/payouts/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    }

    const p = rows[0];
    const { rows: attempts } = await pool.query(
      `SELECT attempt_number, status, error_code, error_safe, started_at, finished_at
       FROM annual_incentive_payout_attempts WHERE payout_id = $1 ORDER BY attempt_number`,
      [p.id]
    );

    res.json({
      success: true,
      data: {
        id: p.id,
        requestId: p.request_id,
        driverId: p.driver_id,
        amountCents: p.amount_cents.toString(),
        providerName: p.provider_name,
        providerPayoutId: p.provider_payout_id,
        externalReference: p.external_reference,
        status: p.status,
        providerStatus: p.provider_status,
        submittedAt: p.submitted_at,
        confirmedAt: p.confirmed_at,
        failedAt: p.failed_at,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        attempts: attempts.map(a => ({
          attemptNumber: a.attempt_number,
          status: a.status,
          errorCode: a.error_code,
          errorSafe: a.error_safe,
          startedAt: a.started_at,
          finishedAt: a.finished_at,
        })),
      },
    });
  } catch (err: any) {
    console.error('[ADMIN_ANNUAL_INCENTIVE_PAYOUT_DETAIL_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /health
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [requests, payouts, outbox, deadlines] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) as count FROM annual_incentive_requests GROUP BY status`),
      pool.query(`SELECT status, COUNT(*) as count FROM annual_incentive_payouts GROUP BY status`),
      pool.query(`SELECT status, COUNT(*) as count FROM annual_incentive_payout_outbox GROUP BY status`),
      pool.query(
        `SELECT COUNT(*) as count FROM annual_incentive_requests
         WHERE deadline_at < NOW() AND status NOT IN ('PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED')`
      ),
    ]);

    res.json({
      success: true,
      data: {
        requests: Object.fromEntries(requests.rows.map(r => [r.status, parseInt(r.count)])),
        payouts: Object.fromEntries(payouts.rows.map(r => [r.status, parseInt(r.count)])),
        outbox: Object.fromEntries(outbox.rows.map(r => [r.status, parseInt(r.count)])),
        deadlineBreaches: parseInt(deadlines.rows[0]?.count ?? '0'),
        providerEnabled: process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED === 'true',
        providerName: process.env.ANNUAL_INCENTIVE_PAYOUT_PROVIDER ?? 'unavailable',
      },
    });
  } catch (err: any) {
    console.error('[ADMIN_ANNUAL_INCENTIVE_HEALTH_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
