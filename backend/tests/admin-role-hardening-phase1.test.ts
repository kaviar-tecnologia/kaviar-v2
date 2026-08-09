/**
 * Fase 1 — Endurecimento de autorização
 * Testa que as 3 rotas (admin-presign, community-leaders, admin-local-support)
 * retornam 403 para roles não autorizados e permitem roles legítimos.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, localSupportMock, prismaMock } = vi.hoisted(() => {
  return {
    authState: {
      admin: { id: 'admin-1', email: 'admin@test.local', name: 'Admin', role: 'SUPER_ADMIN' },
    },
    localSupportMock: {
      listDrivers: vi.fn().mockResolvedValue([]),
      getSummary: vi.fn().mockResolvedValue({}),
      registerDriver: vi.fn().mockResolvedValue({}),
      updateDriver: vi.fn().mockResolvedValue({}),
      recordInvite: vi.fn().mockResolvedValue({}),
    },
    prismaMock: {
      community_leaders: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'leader-1' }),
        update: vi.fn().mockResolvedValue({ id: 'leader-1' }),
        delete: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = authState.admin;
    req.adminId = authState.admin.id;
    next();
  },
  requireRole: (allowedRoles: string[]) => (req: any, res: any, next: any) => {
    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({ success: false, error: 'Acesso negado. Permissão insuficiente.', requiredRoles: allowedRoles, userRole: req.admin.role });
    }
    next();
  },
}));

vi.mock('../src/middlewares/audit-write', () => ({
  auditWrite: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/middlewares/local-support-flag', () => ({
  requireLocalSupportEnabled: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/services/local-support.service', () => ({
  localSupportService: localSupportMock,
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => prismaMock),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

// S3 mock for admin-presign
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  GetObjectCommand: vi.fn(),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

// Enable presign feature
process.env.FEATURE_ADMIN_PRESIGN = 'true';

const { default: presignRouter } = await import('../src/routes/admin-presign');
const { default: communityLeadersRouter } = await import('../src/routes/community-leaders');
const { default: localSupportRouter } = await import('../src/routes/admin-local-support');

const app = express();
app.use(express.json());
app.use('/api/admin/presign', presignRouter);
app.use('/api/admin/community-leaders', communityLeadersRouter);
app.use('/api/admin/local-support', localSupportRouter);

// ─── admin-presign ───────────────────────────────────────────────────────────

describe('admin-presign role enforcement', () => {
  const ALLOWED_ROLES = ['SUPER_ADMIN', 'TERRITORIAL_OPERATOR', 'TERRITORIAL_MANAGER'];
  const DENIED_ROLES = ['FINANCE', 'LEAD_AGENT', 'OPERATOR', 'PET_OPERATOR', 'ANGEL_VIEWER'];

  beforeEach(() => {
    authState.admin = { id: 'admin-1', email: 'admin@test.local', name: 'Admin', role: 'SUPER_ADMIN' };
  });

  for (const role of ALLOWED_ROLES) {
    it(`allows ${role}`, async () => {
      authState.admin.role = role;
      const res = await request(app).get('/api/admin/presign/presign?key=certidoes/test.pdf');
      expect(res.status).not.toBe(403);
    });
  }

  for (const role of DENIED_ROLES) {
    it(`denies ${role} with 403`, async () => {
      authState.admin.role = role;
      const res = await request(app).get('/api/admin/presign/presign?key=certidoes/test.pdf');
      expect(res.status).toBe(403);
    });
  }
});

// ─── community-leaders ───────────────────────────────────────────────────────

describe('community-leaders role enforcement', () => {
  const ALLOWED_ROLES = ['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'];
  const DENIED_ROLES = ['FINANCE', 'LEAD_AGENT', 'ANGEL_VIEWER', 'PET_OPERATOR'];

  beforeEach(() => {
    authState.admin = { id: 'admin-1', email: 'admin@test.local', name: 'Admin', role: 'SUPER_ADMIN' };
  });

  for (const role of ALLOWED_ROLES) {
    it(`allows ${role} to list leaders`, async () => {
      authState.admin.role = role;
      const res = await request(app).get('/api/admin/community-leaders');
      expect(res.status).not.toBe(403);
    });
  }

  for (const role of DENIED_ROLES) {
    it(`denies ${role} with 403`, async () => {
      authState.admin.role = role;
      const res = await request(app).get('/api/admin/community-leaders');
      expect(res.status).toBe(403);
    });
  }
});

// ─── admin-local-support ─────────────────────────────────────────────────────

describe('admin-local-support role enforcement', () => {
  const ALLOWED_ROLES = ['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'];
  const DENIED_ROLES = ['FINANCE', 'LEAD_AGENT', 'ANGEL_VIEWER', 'PET_OPERATOR'];

  beforeEach(() => {
    authState.admin = { id: 'admin-1', email: 'admin@test.local', name: 'Admin', role: 'SUPER_ADMIN' };
  });

  for (const role of ALLOWED_ROLES) {
    it(`allows ${role} to list drivers`, async () => {
      authState.admin.role = role;
      const res = await request(app).get('/api/admin/local-support/drivers');
      expect(res.status).not.toBe(403);
    });
  }

  for (const role of DENIED_ROLES) {
    it(`denies ${role} with 403`, async () => {
      authState.admin.role = role;
      const res = await request(app).get('/api/admin/local-support/drivers');
      expect(res.status).toBe(403);
    });
  }
});
