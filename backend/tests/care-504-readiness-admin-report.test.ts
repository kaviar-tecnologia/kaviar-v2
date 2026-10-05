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

const endpoint = '/api/admin/care-shadow/readiness';

const CARE_ENV_KEYS = [
  'CARE_ADMIN_ENABLED',
  'CARE_PUBLIC_REQUEST_ENABLED',
  'CARE_OFFICIAL_ENABLED',
  'CARE_DISPATCH_ENABLED',
  'CARE_DRIVER_ACCEPTANCE_ENABLED',
  'CARE_AUDIT_STRICT_ENABLED',
];

const makeAuditRow = () => ({
  id: 504,
  adminId: 'super-admin-504',
  adminEmail: 'super@test.local',
  action: 'CARE_ELIGIBILITY_SHADOW_DECISION',
  entityType: 'care_eligibility_shadow',
  entityId: 'ride-readiness-504',
  oldValue: null,
  newValue: {
    version: 'care-eligibility-shadow-v1',
    rideId: 'ride-readiness-504',
    driverId: 'driver-readiness-504',
    status: 'SHADOW_DISABLED',
    operationAllowed: false,
    dispatchAllowed: false,
    acceptanceAllowed: false,
    walletAllowed: false,
    publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
  },
  reason: 'CARE_SHADOW_DISABLED',
  ipAddress: '127.0.0.1',
  userAgent: 'care-504-readiness-test',
  createdAt: new Date('2026-10-05T16:40:00.000Z'),
});

describe('CARE-504 read-only admin readiness report', () => {
  beforeEach(() => {
    authState.admin = null;
    transactionMock.mockReset();
    queryRawMock.mockReset();
    runCareShadowAuditHarnessTxMock.mockReset();
    for (const key of CARE_ENV_KEYS) {
      delete process.env[key];
    }
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

  it('returns a fail-closed read-only readiness report for SUPER_ADMIN', async () => {
    authState.admin = { id: 'super-admin-504', email: 'super@test.local', role: 'SUPER_ADMIN' };
    queryRawMock
      .mockResolvedValueOnce([makeAuditRow()])
      .mockResolvedValueOnce([{ total: 3 }]);

    const response = await request(app)
      .get(endpoint)
      .query({ auditLimit: '3' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      version: 'care-readiness-admin-report-v1',
      readOnly: true,
      careShadow: true,
      publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
      releaseReady: false,
      releaseFlagsEnabled: false,
      publicCareAvailable: false,
      officialCareAvailable: false,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      policyDecision: {
        isCareIntent: true,
        unsupported: true,
        code: 'CARE_SERVICE_NOT_AVAILABLE',
        reason: 'CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION',
      },
      shadowAudit: {
        total: 3,
        latestLimit: 3,
      },
    });

    expect(response.body.data.flags).toMatchObject({
      CARE_ADMIN_ENABLED: false,
      CARE_PUBLIC_REQUEST_ENABLED: false,
      CARE_OFFICIAL_ENABLED: false,
      CARE_DISPATCH_ENABLED: false,
      CARE_DRIVER_ACCEPTANCE_ENABLED: false,
      CARE_AUDIT_STRICT_ENABLED: true,
    });

    expect(response.body.data.requiredReleaseFlags).toEqual([
      'CARE_PUBLIC_REQUEST_ENABLED',
      'CARE_OFFICIAL_ENABLED',
      'CARE_DISPATCH_ENABLED',
      'CARE_DRIVER_ACCEPTANCE_ENABLED',
      'CARE_AUDIT_STRICT_ENABLED',
    ]);

    expect(response.body.data.missingReleaseFlags).toEqual([
      'CARE_PUBLIC_REQUEST_ENABLED',
      'CARE_OFFICIAL_ENABLED',
      'CARE_DISPATCH_ENABLED',
      'CARE_DRIVER_ACCEPTANCE_ENABLED',
    ]);

    expect(response.body.data.blockers.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining([
        'CARE_OFFICIAL_FLOW_NOT_IMPLEMENTED',
        'CARE_PUBLIC_POLICY_STILL_BLOCKED',
        'CARE_PUBLIC_REQUEST_ENABLED_FALSE',
        'CARE_OFFICIAL_ENABLED_FALSE',
        'CARE_DISPATCH_ENABLED_FALSE',
        'CARE_DRIVER_ACCEPTANCE_ENABLED_FALSE',
      ]),
    );

    expect(response.body.data.shadowAudit.latest).toHaveLength(1);
    expect(response.body.data.shadowAudit.latest[0]).toMatchObject({
      id: '504',
      readOnly: true,
      careShadow: true,
      publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
    });

    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('stays blocked even when all release flags are true', async () => {
    for (const key of CARE_ENV_KEYS) {
      process.env[key] = 'true';
    }

    authState.admin = { id: 'super-admin-504', email: 'super@test.local', role: 'SUPER_ADMIN' };
    queryRawMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const response = await request(app)
      .get(endpoint)
      .query({ auditLimit: '0' });

    expect(response.status).toBe(200);
    expect(response.body.data.releaseFlagsEnabled).toBe(true);
    expect(response.body.data.releaseReady).toBe(false);
    expect(response.body.data.publicCareAvailable).toBe(false);
    expect(response.body.data.officialCareAvailable).toBe(false);
    expect(response.body.data.policyDecision).toMatchObject({
      unsupported: true,
      code: 'CARE_SERVICE_NOT_AVAILABLE',
    });
    expect(response.body.data.blockers.map((item: { code: string }) => item.code)).toContain(
      'CARE_RELEASE_FLAGS_TRUE_BUT_POLICY_BLOCKED',
    );

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('keeps audit limit bounded and still read-only', async () => {
    authState.admin = { id: 'super-admin-504', email: 'super@test.local', role: 'SUPER_ADMIN' };
    queryRawMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const response = await request(app)
      .get(endpoint)
      .query({ auditLimit: '9999' });

    expect(response.status).toBe(200);
    expect(response.body.data.shadowAudit).toMatchObject({
      total: 0,
      latestLimit: 20,
      latest: [],
    });

    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('documents the read-only scope and avoids operational wiring', () => {
    const route = readFileSync('src/routes/admin-care-shadow.ts', 'utf8');
    const doc = readFileSync('../docs/care/CARE-504-readiness-admin-report.md', 'utf8');

    expect(route).toContain("router.get('/readiness'");
    expect(route).toContain('CARE_READINESS_REPORT_FAILED');
    expect(route).toContain('releaseReady: false');
    expect(route).toContain('publicCareAvailable: false');
    expect(route).toContain('officialCareAvailable: false');
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
      expect(content).not.toContain('/care-shadow/readiness');
      expect(content).not.toContain('CARE_READINESS_REPORT_FAILED');
    }

    expect(doc).toContain('GET /api/admin/care-shadow/readiness');
    expect(doc).toContain('read-only');
    expect(doc).toContain('não cria corrida CARE');
    expect(doc).toContain('não executa harness');
    expect(doc).toContain('não aciona dispatcher');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
  });
});
