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
import { projectFromAggregateRows } from '../services/finance/annual-incentive-payout/balance-projection';

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

// GET /provision — aggregate provisioning view for Contas a Pagar
router.get('/provision', async (_req: Request, res: Response) => {
  try {
    // Single query: fetch all events grouped by driver + program_year + event_type
    const { rows } = await pool.query<{
      driver_id: string;
      program_year: number;
      event_type: string;
      total_cents: string;
    }>(`
      SELECT driver_id, program_year, event_type, SUM(ABS(amount_cents))::text AS total_cents
      FROM annual_incentive_ledger
      GROUP BY driver_id, program_year, event_type
      ORDER BY driver_id, program_year
    `);

    // Group rows by driver_id
    const driverRows = new Map<string, Array<{ program_year: number; event_type: string; total_cents: string }>>();
    for (const row of rows) {
      if (!driverRows.has(row.driver_id)) driverRows.set(row.driver_id, []);
      driverRows.get(row.driver_id)!.push({ program_year: row.program_year, event_type: row.event_type, total_cents: row.total_cents });
    }

    // Project each driver using the canonical function
    let totalAccrued = 0n;
    let totalReversed = 0n;
    let totalPaid = 0n;
    let totalOpenReserved = 0n;
    let totalAvailable = 0n;
    const byDriver: Array<{ driver_id: string; accrued_cents: string; available_cents: string; reserved_cents: string; paid_cents: string; reversed_cents: string }> = [];
    let driversWithBalance = 0;

    for (const [driverId, driverRowSet] of driverRows) {
      const projection = projectFromAggregateRows(driverId, driverRowSet);
      totalAccrued += projection.totalAccruedCents;
      totalReversed += projection.totalReversedCents;
      totalPaid += projection.totalPaidCents;
      totalOpenReserved += projection.totalOpenReservedCents;
      totalAvailable += projection.totalAvailableCents;

      if (projection.totalAvailableCents > 0n) driversWithBalance++;

      byDriver.push({
        driver_id: driverId,
        accrued_cents: projection.totalAccruedCents.toString(),
        available_cents: projection.totalAvailableCents.toString(),
        reserved_cents: projection.totalOpenReservedCents.toString(),
        paid_cents: projection.totalPaidCents.toString(),
        reversed_cents: projection.totalReversedCents.toString(),
      });
    }

    // Sort by accrued descending, limit 200
    byDriver.sort((a, b) => {
      const ba = BigInt(b.accrued_cents);
      const aa = BigInt(a.accrued_cents);
      return ba > aa ? 1 : ba < aa ? -1 : 0;
    });
    const topDrivers = byDriver.slice(0, 200);

    // By year (aggregate across all drivers)
    const yearAgg = new Map<number, { accrued: bigint; paid: bigint }>();
    for (const row of rows) {
      const y = row.program_year;
      if (!yearAgg.has(y)) yearAgg.set(y, { accrued: 0n, paid: 0n });
      const e = yearAgg.get(y)!;
      const cents = BigInt(row.total_cents);
      if (row.event_type === 'ACCRUAL' || row.event_type === 'CARRY_FORWARD_IN') e.accrued += cents;
      if (row.event_type === 'PAYMENT') e.paid += cents;
    }

    res.json({
      success: true,
      data: {
        summary: {
          total_accrued_cents: totalAccrued.toString(),
          total_available_cents: totalAvailable.toString(),
          total_reserved_cents: totalOpenReserved.toString(),
          total_paid_cents: totalPaid.toString(),
          total_reversed_cents: totalReversed.toString(),
          drivers_with_balance: driversWithBalance,
        },
        by_year: [...yearAgg.entries()].sort((a, b) => a[0] - b[0]).map(([year, d]) => ({
          program_year: year,
          accrued_cents: d.accrued.toString(),
          paid_cents: d.paid.toString(),
        })),
        by_driver: topDrivers,
      },
    });
  } catch (err: any) {
    console.error('[ADMIN_ANNUAL_INCENTIVE_PROVISION_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /provision/drivers — operational table: per-driver detail with name, Pix, status, payment evidence
router.get('/provision/drivers', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // 1. Ledger aggregates per driver
    const { rows: ledgerRows } = await pool.query<{
      driver_id: string; program_year: number; event_type: string; total_cents: string;
    }>(`
      SELECT driver_id, program_year, event_type, SUM(ABS(amount_cents))::text AS total_cents
      FROM annual_incentive_ledger
      GROUP BY driver_id, program_year, event_type
      ORDER BY driver_id, program_year
    `);

    // Group by driver
    const driverAgg = new Map<string, Array<{ program_year: number; event_type: string; total_cents: string }>>();
    for (const r of ledgerRows) {
      if (!driverAgg.has(r.driver_id)) driverAgg.set(r.driver_id, []);
      driverAgg.get(r.driver_id)!.push({ program_year: r.program_year, event_type: r.event_type, total_cents: r.total_cents });
    }

    // Project each driver, filter those with balance > 0, sort by accrued desc
    const projections: Array<{
      driver_id: string; accrued_cents: bigint; available_cents: bigint;
      reserved_cents: bigint; paid_cents: bigint; reversed_cents: bigint;
    }> = [];
    for (const [driverId, rows] of driverAgg) {
      const p = projectFromAggregateRows(driverId, rows);
      if (p.totalAccruedCents > 0n) {
        projections.push({
          driver_id: driverId,
          accrued_cents: p.totalAccruedCents,
          available_cents: p.totalAvailableCents,
          reserved_cents: p.totalOpenReservedCents,
          paid_cents: p.totalPaidCents,
          reversed_cents: p.totalReversedCents,
        });
      }
    }
    projections.sort((a, b) => a.accrued_cents < b.accrued_cents ? 1 : a.accrued_cents > b.accrued_cents ? -1 : 0);
    const page = projections.slice(offset, offset + limit);
    if (page.length === 0) {
      return res.json({ success: true, data: { drivers: [], total: projections.length } });
    }

    const driverIds = page.map(p => p.driver_id);

    // 2. Driver names
    const { rows: drivers } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM drivers WHERE id = ANY($1)`, [driverIds]
    );
    const driverNameMap = new Map(drivers.map(d => [d.id, d.name]));

    // 3. Masked Pix destinations (active, not superseded)
    const { rows: pixDests } = await pool.query<{ driver_id: string; pix_key_masked: string }>(
      `SELECT driver_id, pix_key_masked FROM driver_payout_destinations
       WHERE driver_id = ANY($1) AND status = 'active' AND superseded_at IS NULL`, [driverIds]
    );
    const pixMap = new Map(pixDests.map(d => [d.driver_id, d.pix_key_masked]));

    // 4. Latest payout per driver (for payment evidence)
    const { rows: payouts } = await pool.query<{
      driver_id: string; amount_cents: string; provider_payout_id: string | null; external_reference: string | null;
      provider_status: string | null; status: string; confirmed_at: string | null;
      submitted_at: string | null; failed_at: string | null;
    }>(`
      SELECT DISTINCT ON (driver_id) driver_id, amount_cents::text AS amount_cents,
             provider_payout_id, external_reference,
             provider_status, status, confirmed_at, submitted_at, failed_at
      FROM annual_incentive_payouts
      WHERE driver_id = ANY($1)
      ORDER BY driver_id, created_at DESC, id DESC
    `, [driverIds]);
    const payoutMap = new Map(payouts.map(p => [p.driver_id, p]));

    // 5. Latest request status per driver
    const { rows: requests } = await pool.query<{
      driver_id: string; status: string; destination_masked: string | null;
    }>(`
      SELECT DISTINCT ON (driver_id) driver_id, status, destination_masked
      FROM annual_incentive_requests
      WHERE driver_id = ANY($1)
      ORDER BY driver_id, created_at DESC, id DESC
    `, [driverIds]);
    const requestMap = new Map(requests.map(r => [r.driver_id, r]));

    // 6. Build response
    const driversResult = page.map(p => {
      const payout = payoutMap.get(p.driver_id);
      const request = requestMap.get(p.driver_id);

      // Determine display status
      let displayStatus = 'DISPONÍVEL';
      if (p.paid_cents > 0n && payout?.confirmed_at && p.available_cents === 0n && p.reserved_cents === 0n) displayStatus = 'PAGO';
      else if (p.paid_cents > 0n && payout?.confirmed_at && p.available_cents > 0n) displayStatus = 'PAGO PARCIAL';
      else if (payout?.failed_at) displayStatus = 'FALHOU';
      else if (payout?.submitted_at) displayStatus = 'PROCESSANDO';
      else if (p.reserved_cents > 0n) displayStatus = 'RESERVADO';
      else if (request?.status === 'RESERVED') displayStatus = 'SOLICITADO';
      else if (p.available_cents > 0n) displayStatus = 'DISPONÍVEL';

      return {
        driver_id: p.driver_id,
        name: driverNameMap.get(p.driver_id) || '—',
        type: 'MOTORISTA',
        pix_masked: pixMap.get(p.driver_id) || null,
        accrued_cents: p.accrued_cents.toString(),
        available_cents: p.available_cents.toString(),
        reserved_cents: p.reserved_cents.toString(),
        paid_cents: p.paid_cents.toString(),
        reversed_cents: p.reversed_cents.toString(),
        display_status: displayStatus,
        confirmed_at: payout?.confirmed_at || null,
        evidence: payout ? {
          amount_cents: payout.amount_cents,
          provider_payout_id: payout.provider_payout_id,
          external_reference: payout.external_reference,
          provider_status: payout.provider_status,
          internal_status: payout.status,
          submitted_at: payout.submitted_at,
          confirmed_at: payout.confirmed_at,
          failed_at: payout.failed_at,
        } : null,
      };
    });

    res.json({ success: true, data: { drivers: driversResult, total: projections.length } });
  } catch (err: any) {
    console.error('[ADMIN_ANNUAL_INCENTIVE_PROVISION_DRIVERS_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
