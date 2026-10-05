import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const authState = vi.hoisted(() => ({
  admin: null as null | { id: string; email: string; role: string },
}));

const transactionMock = vi.hoisted(() => vi.fn());
const runCareShadowAuditHarnessTxMock = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
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

const endpoint = '/api/admin/care-shadow/harness';

const makeHarnessResult = () => ({
  version: 'care-shadow-audit-harness-v1',
  harnessOnly: true,
  auditWritten: true,
  operationAllowed: false,
  dispatchAllowed: false,
  acceptanceAllowed: false,
  walletAllowed: false,
  publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
  decision: {
    shadowOnly: true,
    status: 'SHADOW_DISABLED',
    shadowEnabled: false,
    reasons: ['CARE_SHADOW_DISABLED'],
    operationAllowed: false,
    dispatchAllowed: false,
    acceptanceAllowed: false,
    walletAllowed: false,
    publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
    auditEvent: {
      kind: 'CARE_ELIGIBILITY_SHADOW_DECISION',
      rideId: 'ride-http-502',
      driverId: 'driver-http-502',
      evaluatedAt: '2026-10-05T15:00:00.000Z',
      shadowEnabled: false,
      eligibilityEligible: null,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
      reasons: ['CARE_SHADOW_DISABLED'],
    },
  },
});

describe('CARE-502 admin shadow harness HTTP entry', () => {
  beforeEach(() => {
    authState.admin = null;
    transactionMock.mockReset();
    transactionMock.mockImplementation(async (callback: any) => callback({ tx: 'care-502-tx' }));
    runCareShadowAuditHarnessTxMock.mockReset();
    runCareShadowAuditHarnessTxMock.mockResolvedValue(makeHarnessResult());
  });

  it('returns 401 without an authenticated admin context', async () => {
    const response = await request(app)
      .post(endpoint)
      .send({ rideId: 'ride-http-502', driverId: 'driver-http-502' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-SUPER_ADMIN roles including passenger/driver-like roles', async () => {
    for (const role of ['TERRITORIAL_MANAGER', 'FINANCE', 'PASSENGER', 'DRIVER']) {
      authState.admin = { id: `actor-${role}`, email: `${role}@test.local`, role };

      const response = await request(app)
        .post(endpoint)
        .send({ rideId: 'ride-http-502', driverId: 'driver-http-502' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    }

    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('returns 400 for SUPER_ADMIN with missing rideId or driverId', async () => {
    authState.admin = { id: 'super-admin-502', email: 'super@test.local', role: 'SUPER_ADMIN' };

    const response = await request(app)
      .post(endpoint)
      .send({ rideId: ' ', driverId: 'driver-http-502' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: 'CARE_SHADOW_HARNESS_INPUT_INVALID',
      required: ['rideId', 'driverId'],
    });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(runCareShadowAuditHarnessTxMock).not.toHaveBeenCalled();
  });

  it('returns 200 shadow-only for SUPER_ADMIN with valid input and never grants operation', async () => {
    authState.admin = { id: 'super-admin-502', email: 'super@test.local', role: 'SUPER_ADMIN' };

    const response = await request(app)
      .post(endpoint)
      .set('user-agent', 'care-502-http-test')
      .send({
        rideId: ' ride-http-502 ',
        driverId: ' driver-http-502 ',
        reason: 'manual HTTP shadow test',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      harnessOnly: true,
      auditWritten: true,
      publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      decision: {
        shadowOnly: true,
        status: 'SHADOW_DISABLED',
        shadowEnabled: false,
        publicCode: 'CARE_SERVICE_NOT_AVAILABLE',
        operationAllowed: false,
        dispatchAllowed: false,
        acceptanceAllowed: false,
        walletAllowed: false,
      },
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(runCareShadowAuditHarnessTxMock).toHaveBeenCalledTimes(1);

    const [tx, input] = runCareShadowAuditHarnessTxMock.mock.calls[0];

    expect(tx).toEqual({ tx: 'care-502-tx' });
    expect(input).toMatchObject({
      rideId: 'ride-http-502',
      driverId: 'driver-http-502',
      externalEvidence: null,
      adminId: 'super-admin-502',
      reason: 'manual HTTP shadow test',
      userAgent: 'care-502-http-test',
    });
    expect(input.now).toBeInstanceOf(Date);
  });

  it('does not wire the HTTP entry to passenger driver dispatcher acceptance pricing wallet or migrations', () => {
    const passengerRides = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatcher = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const pricing = readFileSync('src/services/pricing-engine.ts', 'utf8');
    const walletShadow = readFileSync('src/services/wallet-shadow.service.ts', 'utf8');
    const route = readFileSync('src/routes/admin-care-shadow.ts', 'utf8');
    const doc = readFileSync('../docs/care/CARE-502-admin-shadow-http.md', 'utf8');

    expect(passengerRides).not.toContain('runCareShadowAuditHarnessTx');
    expect(dispatcher).not.toContain('runCareShadowAuditHarnessTx');
    expect(acceptance).not.toContain('runCareShadowAuditHarnessTx');
    expect(pricing).not.toContain('runCareShadowAuditHarnessTx');
    expect(walletShadow).not.toContain('runCareShadowAuditHarnessTx');

    expect(route).toContain("router.post('/harness'");
    expect(route).toContain('requireSuperAdmin');
    expect(route).toContain('operationAllowed: false');
    expect(route).toContain('dispatchAllowed: false');
    expect(route).toContain('acceptanceAllowed: false');
    expect(route).toContain('walletAllowed: false');

    expect(doc).toContain('401');
    expect(doc).toContain('403');
    expect(doc).toContain('400');
    expect(doc).toContain('200 shadow-only');
    expect(doc).toContain('sem rota pública');
    expect(doc).toContain('sem app passageiro');
    expect(doc).toContain('sem app motorista');
    expect(doc).toContain('sem dispatcher');
    expect(doc).toContain('sem aceite');
    expect(doc).toContain('sem pricing');
    expect(doc).toContain('sem wallet');
    expect(doc).toContain('sem migration');
    expect(doc).toContain('sem deploy');
  });
});
