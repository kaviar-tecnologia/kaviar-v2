import { describe, expect, it, vi } from 'vitest';
import {
  claimNextDevelopmentJob,
  finalizeDevelopmentJob,
  heartbeatDevelopmentJob,
} from '../src/services/ai/kaviar-ai.development-worker';

function makePool(options?: {
  pickedId?: string | null;
  updateRow?: Record<string, unknown>;
  selectError?: Error;
}) {
  const query = vi.fn(async (sql: string) => {
    const normalized = String(sql).trim();

    if (normalized === 'BEGIN') {
      return { rows: [] };
    }

    if (normalized === 'COMMIT') {
      return { rows: [] };
    }

    if (normalized === 'ROLLBACK') {
      return { rows: [] };
    }

    if (normalized.includes('SELECT id')) {
      if (options?.selectError) {
        throw options.selectError;
      }

      return {
        rows:
          options?.pickedId === null
            ? []
            : [{ id: options?.pickedId ?? 'job-1' }],
      };
    }

    if (normalized.includes('UPDATE development_jobs')) {
      return {
        rows: [
          options?.updateRow ?? {
            id: options?.pickedId ?? 'job-1',
            category: 'BUG_FIX',
            summary: 'Corrigir bug',
            status: 'RUNNING',
            attempts: 1,
            locked_by: 'worker-a',
            started_at: new Date('2026-08-18T04:00:00Z'),
            locked_at: new Date('2026-08-18T04:00:01Z'),
            allowed_paths: [
              'backend/src/services/example.ts',
            ],
          },
        ],
      };
    }

    throw new Error(`QUERY_NAO_ESPERADA: ${normalized}`);
  });

  const release = vi.fn();

  const client = {
    query,
    release,
  };

  const connect = vi.fn(async () => client);

  return {
    pool: { connect } as any,
    client,
    query,
    connect,
    release,
  };
}

describe('KAVIAR AI — Development Worker Phase 3', () => {
  it('claims one eligible job and transitions it to RUNNING', async () => {
    const fake = makePool({
      pickedId: 'job-queued',
      updateRow: {
        id: 'job-queued',
        category: 'BUG_FIX',
        summary: 'Corrigir bug no backend',
        status: 'RUNNING',
        attempts: 1,
        locked_by: 'worker-a',
        started_at: new Date('2026-08-18T04:00:00Z'),
        locked_at: new Date('2026-08-18T04:00:01Z'),
        allowed_paths: [
          'backend/src/services/example.ts',
        ],
      },
    });

    const result = await claimNextDevelopmentJob({
      pool: fake.pool,
      workerId: 'worker-a',
    });

    expect(result).toEqual({
      id: 'job-queued',
      category: 'BUG_FIX',
      summary: 'Corrigir bug no backend',
      allowedPaths: [
        'backend/src/services/example.ts',
      ],
      status: 'RUNNING',
      attempts: 1,
      lockedBy: 'worker-a',
      startedAt: new Date('2026-08-18T04:00:00Z'),
      lockedAt: new Date('2026-08-18T04:00:01Z'),
    });

    expect(fake.query.mock.calls[0][0]).toBe('BEGIN');

    const selectSql = String(fake.query.mock.calls[1][0]);
    expect(selectSql).toContain("status = 'QUEUED'");
    expect(selectSql).toContain("status = 'RUNNING'");
    expect(selectSql).toContain('locked_at');
    expect(selectSql).toContain('FOR UPDATE SKIP LOCKED');

    const updateSql = String(fake.query.mock.calls[2][0]);
    expect(updateSql).toContain("status = 'RUNNING'");
    expect(updateSql).toContain(
      'started_at = COALESCE(started_at, NOW())',
    );
    expect(updateSql).toContain('locked_at = NOW()');
    expect(updateSql).toContain('attempts = attempts + 1');

    expect(fake.query.mock.calls[3][0]).toBe('COMMIT');
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it('returns null without updating when no eligible job exists', async () => {
    const fake = makePool({
      pickedId: null,
    });

    const result = await claimNextDevelopmentJob({
      pool: fake.pool,
      workerId: 'worker-empty',
    });

    expect(result).toBeNull();
    expect(fake.query).toHaveBeenCalledTimes(3);
    expect(fake.query.mock.calls[0][0]).toBe('BEGIN');
    expect(String(fake.query.mock.calls[1][0])).toContain(
      'FOR UPDATE SKIP LOCKED',
    );
    expect(fake.query.mock.calls[2][0]).toBe('COMMIT');
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it('rejects an empty worker id before opening a database connection', async () => {
    const fake = makePool();

    await expect(
      claimNextDevelopmentJob({
        pool: fake.pool,
        workerId: '   ',
      }),
    ).rejects.toThrow('DEVELOPMENT_WORKER_ID_REQUIRED');

    expect(fake.connect).not.toHaveBeenCalled();
  });

  it('rolls back and releases the connection when claim selection fails', async () => {
    const fake = makePool({
      selectError: new Error('database failure'),
    });

    await expect(
      claimNextDevelopmentJob({
        pool: fake.pool,
        workerId: 'worker-error',
      }),
    ).rejects.toThrow('database failure');

    expect(fake.query.mock.calls[0][0]).toBe('BEGIN');
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(fake.release).toHaveBeenCalledOnce();
  });
});

describe('KAVIAR AI — Development Worker heartbeat', () => {
  it('renews the lease only while the worker still owns the RUNNING job', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'job-owned' }],
    }));

    const result = await heartbeatDevelopmentJob(
      {
        pool: { query } as any,
        workerId: 'worker-a',
      },
      'job-owned',
    );

    expect(result).toBe(true);
    expect(query).toHaveBeenCalledOnce();

    const [sql, params] = query.mock.calls[0];

    expect(String(sql)).toContain("status = 'RUNNING'");
    expect(String(sql)).toContain('locked_by = $2');
    expect(String(sql)).toContain('locked_at = NOW()');
    expect(params).toEqual(['job-owned', 'worker-a']);
  });

  it('returns false when ownership has been lost', async () => {
    const query = vi.fn(async () => ({
      rows: [],
    }));

    const result = await heartbeatDevelopmentJob(
      {
        pool: { query } as any,
        workerId: 'worker-b',
      },
      'job-lost',
    );

    expect(result).toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });
});

describe('KAVIAR AI — Development Worker finalization', () => {
  it('finalizes a RUNNING job only while the worker still owns it', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'job-owned' }],
    }));

    const result = await finalizeDevelopmentJob(
      {
        pool: { query } as any,
        workerId: 'worker-a',
      },
      'job-owned',
      'SUCCEEDED',
    );

    expect(result).toBe(true);
    expect(query).toHaveBeenCalledOnce();

    const [sql, params] = query.mock.calls[0];

    expect(String(sql)).toContain("status = 'RUNNING'");
    expect(String(sql)).toContain('locked_by = $2');
    expect(String(sql)).toContain('status = $3');
    expect(String(sql)).toContain('locked_at = NULL');
    expect(String(sql)).toContain('locked_by = NULL');
    expect(params).toEqual([
      'job-owned',
      'worker-a',
      'SUCCEEDED',
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('persists changed paths, summary and error metadata on finalization', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'job-result' }],
    }));

    const result = await finalizeDevelopmentJob(
      {
        pool: { query } as any,
        workerId: 'worker-a',
      },
      'job-result',
      'SUCCEEDED',
      {
        changedPaths: [
          'backend/tests/example.test.ts',
        ],
        resultSummary: 'Execução validada com sucesso.',
        errorMessage: undefined,
      },
    );

    expect(result).toBe(true);

    const [sql, params] = query.mock.calls[0];

    expect(String(sql)).toContain(
      'result_changed_paths = $4::jsonb',
    );
    expect(String(sql)).toContain(
      'result_summary = $5',
    );
    expect(String(sql)).toContain(
      'error_message = $8',
    );
    expect(String(sql)).toContain(
      'completed_at = NOW()',
    );

    expect(params).toEqual([
      'job-result',
      'worker-a',
      'SUCCEEDED',
      JSON.stringify([
        'backend/tests/example.test.ts',
      ]),
      'Execução validada com sucesso.',
      null,
      null,
      null,
    ]);
  });

  it('persists branch and commit SHA on successful finalization', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'job-owned' }],
    }));

    const result = await finalizeDevelopmentJob(
      {
        pool: { query } as any,
        workerId: 'worker-a',
      },
      'job-owned',
      'SUCCEEDED',
      {
        changedPaths: [
          'backend/tests/example.test.ts',
        ],
        resultSummary:
          'Execução concluída.',
        resultBranch:
          'agent/job-49a0caa097ad',
        resultCommitSha:
          '0123456789abcdef0123456789abcdef01234567',
      },
    );

    expect(result).toBe(true);

    const [sql, params] = query.mock.calls[0];

    expect(String(sql)).toContain(
      'result_branch = $6',
    );

    expect(String(sql)).toContain(
      'result_commit_sha = $7',
    );

    expect(params).toEqual([
      'job-owned',
      'worker-a',
      'SUCCEEDED',
      JSON.stringify([
        'backend/tests/example.test.ts',
      ]),
      'Execução concluída.',
      'agent/job-49a0caa097ad',
      '0123456789abcdef0123456789abcdef01234567',
      null,
    ]);
  });

  it('does not finalize after ownership has been lost', async () => {
    const query = vi.fn(async () => ({
      rows: [],
    }));

    const result = await finalizeDevelopmentJob(
      {
        pool: { query } as any,
        workerId: 'worker-old',
      },
      'job-reclaimed',
      'FAILED',
    );

    expect(result).toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });
});

