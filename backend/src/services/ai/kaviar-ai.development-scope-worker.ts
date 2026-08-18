import type { Pool } from 'pg';

const STALE_SCOPE_LOCK_MINUTES = 15;

export interface DevelopmentScopeWorkerDeps {
  pool: Pool;
  workerId: string;
}

export interface ClaimedDevelopmentScopeJob {
  id: string;
  category: string;
  summary: string;
  lockedBy: string;
  lockedAt: Date;
}

function normalizeWorkerId(workerId: string): string {
  const normalized = workerId.trim();

  if (!normalized) {
    throw new Error(
      'DEVELOPMENT_SCOPE_WORKER_ID_REQUIRED',
    );
  }

  return normalized;
}

export async function claimNextDevelopmentScopeJob(
  deps: DevelopmentScopeWorkerDeps,
): Promise<ClaimedDevelopmentScopeJob | null> {
  const workerId = normalizeWorkerId(
    deps.workerId,
  );

  const client = await deps.pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
      SELECT id
      FROM development_jobs
      WHERE
        status = 'AWAITING_SCOPE'
        AND (
          locked_at IS NULL
          OR locked_at <=
            NOW() - ($1 * INTERVAL '1 minute')
        )
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
      `,
      [STALE_SCOPE_LOCK_MINUTES],
    );

    const picked = rows[0];

    if (!picked) {
      await client.query('COMMIT');
      return null;
    }

    const result = await client.query(
      `
      UPDATE development_jobs
      SET
        locked_at = NOW(),
        locked_by = $1,
        updated_at = NOW()
      WHERE
        id = $2
        AND status = 'AWAITING_SCOPE'
      RETURNING
        id,
        category,
        summary,
        locked_by,
        locked_at
      `,
      [workerId, picked.id],
    );

    await client.query('COMMIT');

    const job = result.rows[0];

    if (!job) {
      throw new Error(
        'DEVELOPMENT_SCOPE_CLAIM_FAILED',
      );
    }

    return {
      id: job.id,
      category: job.category,
      summary: job.summary,
      lockedBy: job.locked_by,
      lockedAt: job.locked_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatDevelopmentScopeJob(
  deps: DevelopmentScopeWorkerDeps,
  jobId: string,
): Promise<boolean> {
  const workerId = normalizeWorkerId(
    deps.workerId,
  );

  const id = jobId.trim();

  if (!id) {
    throw new Error(
      'DEVELOPMENT_JOB_ID_REQUIRED',
    );
  }

  const result = await deps.pool.query(
    `
    UPDATE development_jobs
    SET
      locked_at = NOW(),
      updated_at = NOW()
    WHERE
      id = $1
      AND status = 'AWAITING_SCOPE'
      AND locked_by = $2
    RETURNING id
    `,
    [id, workerId],
  );

  return result.rows.length === 1;
}

export async function releaseDevelopmentScopeJob(
  deps: DevelopmentScopeWorkerDeps,
  jobId: string,
): Promise<boolean> {
  const workerId = normalizeWorkerId(
    deps.workerId,
  );

  const id = jobId.trim();

  if (!id) {
    throw new Error(
      'DEVELOPMENT_JOB_ID_REQUIRED',
    );
  }

  const result = await deps.pool.query(
    `
    UPDATE development_jobs
    SET
      locked_at = NULL,
      locked_by = NULL,
      updated_at = NOW()
    WHERE
      id = $1
      AND status = 'AWAITING_SCOPE'
      AND locked_by = $2
    RETURNING id
    `,
    [id, workerId],
  );

  return result.rows.length === 1;
}
