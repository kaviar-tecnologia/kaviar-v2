/**
 * Regression test: authLimiter in app.ts skips only in NODE_ENV=test.
 *
 * Proves:
 * 1. With NODE_ENV=test, many logins do NOT return 429
 * 2. Invalid credentials still return 401 (auth is NOT bypassed)
 * 3. The skip condition depends only on process.env.NODE_ENV (not user input)
 *
 * Note: We do NOT test the production behavior (NODE_ENV !== 'test')
 * in this file because changing NODE_ENV after module load does not
 * re-evaluate the skip closure in express-rate-limit. The existing
 * auth-rate-limit.test.ts covers that scenario.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('authLimiter — test environment bypass', () => {
  const loginEndpoint = '/api/admin/auth/login';

  it('NODE_ENV is "test" during this suite', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('25+ login attempts do NOT return 429 in test env', async () => {
    // The authLimiter in app.ts has max=20 per 15min.
    // Without skip, attempt #21+ would get 429.
    // With skip, all should reach the auth handler.
    const results: number[] = [];

    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post(loginEndpoint)
        .send({ email: 'nonexistent@kaviar.test', password: 'wrong' });
      results.push(res.status);
    }

    // None should be 429 (rate limited)
    const rateLimited = results.filter(s => s === 429);
    expect(rateLimited).toHaveLength(0);

    // All should be 401 (invalid credentials — auth still works)
    const unauthorized = results.filter(s => s === 401);
    expect(unauthorized).toHaveLength(25);
  });

  it('invalid credentials still fail with 401 (skip does NOT bypass auth)', async () => {
    const res = await request(app)
      .post(loginEndpoint)
      .send({ email: 'fake@kaviar.test', password: 'badpassword' });

    expect(res.status).toBe(401);
  });

  it('missing body fields still return appropriate error', async () => {
    const res = await request(app)
      .post(loginEndpoint)
      .send({});

    // Should be 400 or 401, never 429
    expect(res.status).not.toBe(429);
    expect([400, 401, 422]).toContain(res.status);
  });

  it('skip condition is not controllable via request headers', async () => {
    // Even with a custom header, the limiter should still be skipped
    // (because it depends on process.env only, not request)
    const res = await request(app)
      .post(loginEndpoint)
      .set('X-Skip-Rate-Limit', 'false')
      .send({ email: 'attacker@evil.com', password: 'attempt' });

    // Still 401 (auth failure), not 429 (because test env), and not 200
    expect(res.status).toBe(401);
  });
});
