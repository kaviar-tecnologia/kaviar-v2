import type { Pool } from 'pg';
import {
  normalizeDevelopmentAllowedPaths,
} from './kaviar-ai.development-scope-contract';

const STALE_LOCK_MINUTES = 15;

export interface DevelopmentWorkerDeps {
  pool: Pool;
  workerId: string;
}

export interface ClaimedDevelopmentJob {
  id: string;
  category: string;
  summary: string;
  allowedPaths: string[];
  status: 'RUNNING';
  attempts: number;
  lockedBy: string;
  startedAt: Date;
  lockedAt: Date;
}

export async function heartbeatDevelopmentJob(
  deps: DevelopmentWorkerDeps,
  jobId: string,
): Promise<boolean> {
  const workerId = deps.workerId.trim();
  const normalizedJobId = jobId.trim();

  if (!workerId) {
    throw new Error('DEVELOPMENT_WORKER_ID_REQUIRED');
  }

  if (!normalizedJobId) {
    throw new Error('DEVELOPMENT_JOB_ID_REQUIRED');
  }

  const result = await deps.pool.query(
    `
    UPDATE development_jobs
    SET
      locked_at = NOW(),
      updated_at = NOW()
    WHERE
      id = $1
      AND status = 'RUNNING'
      AND locked_by = $2
    RETURNING id
    `,
    [normalizedJobId, workerId],
  );

  return result.rows.length === 1;
}

export type DevelopmentJobFinalStatus =
  | 'SUCCEEDED'
  | 'FAILED';

export interface DevelopmentJobFinalizationResult {
  changedPaths?: string[];
  resultSummary?: string;
  resultBranch?: string;
  resultCommitSha?: string;
  errorMessage?: string;
}

export async function finalizeDevelopmentJob(
  deps: DevelopmentWorkerDeps,
  jobId: string,
  finalStatus: DevelopmentJobFinalStatus,
  finalization: DevelopmentJobFinalizationResult = {},
): Promise<boolean> {
  const workerId = deps.workerId.trim();
  const normalizedJobId = jobId.trim();

  if (!workerId) {
    throw new Error('DEVELOPMENT_WORKER_ID_REQUIRED');
  }

  if (!normalizedJobId) {
    throw new Error('DEVELOPMENT_JOB_ID_REQUIRED');
  }

  const changedPaths =
    finalization.changedPaths?.length
      ? JSON.stringify(finalization.changedPaths)
      : null;

  const resultSummary =
    finalization.resultSummary?.trim().slice(0, 4000) ||
    null;

  const resultBranch =
    finalization.resultBranch?.trim().slice(0, 255) ||
    null;

  const resultCommitSha =
    finalization.resultCommitSha?.trim().slice(0, 64) ||
    null;

  const errorMessage =
    finalization.errorMessage?.trim().slice(0, 4000) ||
    null;

  const result = await deps.pool.query(
    `
    UPDATE development_jobs
    SET
      status = $3,
      result_changed_paths = $4::jsonb,
      result_summary = $5,
      result_branch = $6,
      result_commit_sha = $7,
      error_message = $8,
      completed_at = NOW(),
      locked_at = NULL,
      locked_by = NULL,
      updated_at = NOW()
    WHERE
      id = $1
      AND status = 'RUNNING'
      AND locked_by = $2
    RETURNING id
    `,
    [
      normalizedJobId,
      workerId,
      finalStatus,
      changedPaths,
      resultSummary,
      resultBranch,
      resultCommitSha,
      errorMessage,
    ],
  );

  return result.rows.length === 1;
}

export async function claimNextDevelopmentJob(
  deps: DevelopmentWorkerDeps,
): Promise<ClaimedDevelopmentJob | null> {
  const workerId = deps.workerId.trim();

  if (!workerId) {
    throw new Error('DEVELOPMENT_WORKER_ID_REQUIRED');
  }

  const client = await deps.pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
      SELECT id
      FROM development_jobs
      WHERE
        (
          status = 'QUEUED'
          AND allowed_paths IS NOT NULL
          AND scope_resolved_at IS NOT NULL
        )
        OR (
          status = 'RUNNING'
          AND locked_at IS NOT NULL
          AND locked_at <= NOW() - ($1 * INTERVAL '1 minute')
        )
      ORDER BY
        CASE WHEN status = 'QUEUED' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
      `,
      [STALE_LOCK_MINUTES],
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
        status = 'RUNNING',
        started_at = COALESCE(started_at, NOW()),
        locked_at = NOW(),
        locked_by = $1,
        attempts = attempts + 1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        category,
        summary,
        allowed_paths,
        status,
        attempts,
        locked_by,
        started_at,
        locked_at
      `,
      [workerId, picked.id],
    );

    await client.query('COMMIT');

    const job = result.rows[0];

    const allowedPaths =
      normalizeDevelopmentAllowedPaths(
        job.allowed_paths,
      );

    return {
      id: job.id,
      category: job.category,
      summary: job.summary,
      allowedPaths,
      status: 'RUNNING',
      attempts: job.attempts,
      lockedBy: job.locked_by,
      startedAt: job.started_at,
      lockedAt: job.locked_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
