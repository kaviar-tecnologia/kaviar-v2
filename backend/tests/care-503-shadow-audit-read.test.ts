import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const authState = vi.hoisted(() => ({
  admin: null as null | { id: string; email: string; role: string },
}));

const transactionMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const runCareShadowAuditHarnessTxMock = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
    $queryRaw: queryRawMock,
  },
}));

vi.mock('../src/services/care/care-shadow-audit-harness', () => ({
  runCareShadowAuditHarnessTx: runCareShadowAuditHarnessTxMock,
}));

vi.mock('../src/middlewares/auth', () => {
  const requireRole = (allowedRoles: string[]) => (req: any, res: any, next: any) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Permissão insuficiente.',
        requiredRoles: allowedRoles,
        userRole: req.admin.role,
      });
    }

    return next();
  };

  const authenticateAdmin = (req: any, res: any, next: any) => {
    if (!authState.admin) {
      return res.status(401).json({ success: false, error: 'Token ausente' });
    }

    req.admin = authState.admin;
    req.adminId = authState.admin.id;
    return next();
  };

  const blockedNonAdmin = (_req: any, res: any) =>
    res.status(403).json({ success: false, error: 'Acesso negado' });

  return {
    authenticateAdmin,
    requireRole,
    requireSuperAdmin: requireRole(['SUPER_ADMIN']),
    allowExecutiveConfirmedAction: requireRole(['SUPER_ADMIN', 'EXECUTIVE_ADMIN']),
    allowExecutiveRegulatorySearch: requireRole(['SUPER_ADMIN', 'EXECUTIVE_ADMIN']),
    allowExecutiveReadAccess: requireRole(['SUPER_ADMIN', 'EXECUTIVE_ADMIN']),
    allowReadAccess: requireRole(['SUPER_ADMIN', 'ANGEL_VIEWER', 'TERRITORIAL_OPERATOR', 'TERRITORIAL_MANAGER']),
    allowFinanceAccess: requireRole(['SUPER_ADMIN', 'EXECUTIVE_ADMIN', 'FINANCE']),
    requireAuth: (_req: any, _res: any, next: any) => next(),
    requireAdmin: authenticateAdmin,
    authenticateDriver: blockedNonAdmin,
    authenticatePassenger: blockedNonAdmin,
  };
});

import app from '../src/app';

const endpoint = '/api/admin/care-shadow/audit';

const makeAuditRow = () => ({
  id: 503,
  adminId: 'super-admin-503',
  adminEmail: 'super@test.local',
  action: 'CARE_ELIGIBILITY_SHADOW_DECISION',
  entityType: 'care_eligibility_shadow',
  entityId: 'ride-read-503',
  oldValue: null,
  newValue: {
    version: 'care-eligibility-shadow-v1',
    kind: 'CARE_ELIGIBILITY_SHADOW_DECISION',
    rideId: 'ride-read-503',
    driverId: 'driver-read-503',
    evaluatedAt: '2026-10-05T16:00:00.000Z',
    shadowEnabled: false,
    status: 'SHADOW_DISABLED',
    eligibilityEligible: null,
    operationAllowed: false,
    dispatchAllowed: false,
    acceptanceAllowed: false,
    walletAllowed: false,
    publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
    reasons: ['CARE_SHADOW_DISABLED'],
  },
  reason: 'CARE_SHADOW_DISABLED',
  ipAddress: '127.0.0.1',
  userAgent: 'care-503-read-test',
  createdAt: new Date('2026-10-05T16:00:00.000Z'),
});

describe('CARE-503 shadow audit read-only admin endpoint', () => {
  beforeEach(() => {
    authState.admin = null;
    transactionMock.mockReset();
    queryRawMock.mockReset();
    runCareShadowAuditHarnessTxMock.mockReset();
  });

  it('returns 401 without an authenticated admin context', async () => {
    const response = await request(app).get(endpoint);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-SUPER_ADMIN roles', async () => {
    for (const role of ['TERRITORIAL_MANAGER', 'FINANCE', 'PASSENGER', 'DRIVER']) {
      authState.admin = { id: `actor-${role}`, email: `${role}@test.local`, role };

      const response = await request(app).get(endpoint);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    }

    expect(queryRawMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('returns 200 read-only audit rows for SUPER_ADMIN without triggering harness or writes', async () => {
    authState.admin = { id: 'super-admin-503', email: 'super@test.local', role: 'SUPER_ADMIN' };
    queryRawMock
      .mockResolvedValueOnce([makeAuditRow()])
      .mockResolvedValueOnce([{ total: 1 }]);

    const response = await request(app)
      .get(endpoint)
      .query({
        rideId: ' ride-read-503 ',
        driverId: ' driver-read-503 ',
        adminId: ' super-admin-503 ',
        status: ' SHADOW_DISABLED ',
        limit: '5',
        offset: '1',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      readOnly: true,
      careShadow: true,
      publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      filters: {
        rideId: 'ride-read-503',
        driverId: 'driver-read-503',
        adminId: 'super-admin-503',
        status: 'SHADOW_DISABLED',
      },
      pagination: {
        limit: 5,
        offset: 1,
        total: 1,
        showing: 1,
      },
    });

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      id: '503',
      readOnly: true,
      careShadow: true,
      action: 'CARE_ELIGIBILITY_SHADOW_DECISION',
      entityType: 'care_eligibility_shadow',
      entityId: 'ride-read-503',
      publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
    });

    expect(response.body.data.items[0].newValue).toMatchObject({
      rideId: 'ride-read-503',
      driverId: 'driver-read-503',
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
    });

    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('keeps read limits bounded and still read-only', async () => {
    authState.admin = { id: 'super-admin-503', email: 'super@test.local', role: 'SUPER_ADMIN' };
    queryRawMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const response = await request(app)
      .get(endpoint)
      .query({ limit: '9999', offset: '-10' });

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toMatchObject({
      limit: 100,
      offset: 0,
      total: 0,
      showing: 0,
    });

    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('documents the read-only scope and avoids operational wiring', () => {
    const route = readFileSync('src/routes/admin-care-shadow.ts', 'utf8');
    const doc = readFileSync('../docs/care/CARE-503-shadow-audit-read.md', 'utf8');

    expect(route).toContain("router.get('/audit'");
    expect(route).toContain('CARE_SHADOW_AUDIT_READ_FAILED');
    expect(route).toContain('readOnly: true');
    expect(route).toContain('operationAllowed: false');
    expect(route).toContain('dispatchAllowed: false');
    expect(route).toContain('acceptanceAllowed: false');
    expect(route).toContain('walletAllowed: false');

    for (const file of [
      'src/routes/rides-v2.ts',
      'src/services/dispatcher.service.ts',
      'src/services/offer-acceptance.service.ts',
      'src/services/pricing-engine.ts',
      'src/services/wallet-shadow.service.ts',
    ]) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toContain('/care-shadow/audit');
      expect(content).not.toContain('CARE_SHADOW_AUDIT_READ_FAILED');
    }

    expect(doc).toContain('GET /api/admin/care-shadow/audit');
    expect(doc).toContain('read-only');
    expect(doc).toContain('não cria corrida CARE');
    expect(doc).toContain('não aciona dispatcher');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
  });
});
