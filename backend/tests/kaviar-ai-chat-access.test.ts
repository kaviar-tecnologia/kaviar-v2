import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mocks = vi.hoisted(() => {
  process.env.ADMIN_JWT_SECRET = 'synthetic-chat-policy-secret';
  process.env.JWT_SECRET = 'synthetic-chat-policy-secret';
  return { findAdmin: vi.fn(), ask: vi.fn() };
});

vi.mock('../src/lib/prisma', () => ({ prisma: { admins: { findUnique: mocks.findAdmin } } }));
vi.mock('../src/services/ai/kaviar-ai.service', () => ({ askKaviarAi: mocks.ask }));

import router from '../src/routes/admin-ai';

const app = express();
app.use(express.json());
app.use('/ai', router);

describe('Chat KAVIAR access policy', () => {
  beforeEach(() => {
    mocks.findAdmin.mockReset();
    mocks.ask.mockReset();
    mocks.ask.mockResolvedValue({ answer: 'Resposta sintética', toolsUsed: [] });
  });

  it.each([
    ['SUPER_ADMIN', 200],
    ['FINANCE', 200],
    ['EXECUTIVE_ADMIN', 403],
    ['TERRITORIAL_MANAGER', 403],
  ])('enforces %s at the server', async (role, expectedStatus) => {
    mocks.findAdmin.mockResolvedValue({ id: 'synthetic', name: 'Synthetic', email: 'synthetic@example.test', role, is_active: true });
    const token = jwt.sign({ userId: 'synthetic', userType: 'ADMIN' }, 'synthetic-chat-policy-secret');
    const response = await request(app).post('/ai/chat').set('Authorization', `Bearer ${token}`).send({ question: 'Olá' });
    expect(response.status).toBe(expectedStatus);
    expect(mocks.ask).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
  });
});
