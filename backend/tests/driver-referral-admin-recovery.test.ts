import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, recoverMock, authState } = vi.hoisted(() => ({
  prismaMock: {
    drivers: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  recoverMock: vi.fn(),
  authState: {
    role: 'SUPER_ADMIN',
  },
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/wallet-v2/referral-recovery.service', () => ({
  recoverDriverReferralQualifications: recoverMock,
}));

vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = { id: 'admin-test', role: authState.role };
    next();
  },
  requireSuperAdmin: (_req: any, res: any, next: any) => {
    if (authState.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false });
    }
    next();
  },
  allowReadAccess: (_req: any, _res: any, next: any) => next(),
}));

const { default: adminDriversRouter } =
  await import('../src/routes/admin-drivers');

const app = express();
app.use(express.json());
app.use('/api/admin', adminDriversRouter);

describe('Recuperação de indicação após aprovação administrativa', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authState.role = 'SUPER_ADMIN';

    prismaMock.drivers.findUnique.mockResolvedValue({
      id: 'driver-test',
      status: 'pending',
      active_since: null,
    });

    prismaMock.drivers.update.mockImplementation(async ({ data }: any) => ({
      id: 'driver-test',
      ...data,
    }));

    recoverMock.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aprova motorista e aciona recuperação', async () => {
    const response = await request(app)
      .patch('/api/admin/drivers/driver-test/approve');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.driver.status).toBe('approved');

    expect(recoverMock)
      .toHaveBeenCalledExactlyOnceWith('driver-test');
  });

  it('ativa motorista e aciona recuperação', async () => {
    const response = await request(app)
      .patch('/api/admin/drivers/driver-test/activate');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.driver.status).toBe('active');

    expect(recoverMock)
      .toHaveBeenCalledExactlyOnceWith('driver-test');
  });

  it('falha de recuperação não desfaz aprovação', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    recoverMock.mockRejectedValueOnce(
      new Error('RECOVERY_FAILURE_TEST')
    );

    const response = await request(app)
      .patch('/api/admin/drivers/driver-test/approve');

    await new Promise(resolve => setImmediate(resolve));

    expect(response.status).toBe(200);
    expect(response.body.driver.status).toBe('approved');
    expect(prismaMock.drivers.update).toHaveBeenCalledTimes(1);
    expect(recoverMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[REFERRAL_APPROVAL_RECOVERY_ERROR]',
      expect.any(Error)
    );
  });

  it('falha de recuperação não desfaz ativação', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    recoverMock.mockRejectedValueOnce(
      new Error('RECOVERY_FAILURE_TEST')
    );

    const response = await request(app)
      .patch('/api/admin/drivers/driver-test/activate');

    await new Promise(resolve => setImmediate(resolve));

    expect(response.status).toBe(200);
    expect(response.body.driver.status).toBe('active');
    expect(prismaMock.drivers.update).toHaveBeenCalledTimes(1);
    expect(recoverMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[REFERRAL_ACTIVATION_RECOVERY_ERROR]',
      expect.any(Error)
    );
  });

  it('motorista inexistente não dispara recuperação', async () => {
    prismaMock.drivers.findUnique.mockResolvedValueOnce(null);

    const response = await request(app)
      .patch('/api/admin/drivers/inexistente/approve');

    expect(response.status).toBe(404);
    expect(recoverMock).not.toHaveBeenCalled();
  });

  it('usuário sem privilégio não aprova motorista', async () => {
    authState.role = 'FINANCE';

    const response = await request(app)
      .patch('/api/admin/drivers/driver-test/approve');

    expect(response.status).toBe(403);
    expect(prismaMock.drivers.update).not.toHaveBeenCalled();
    expect(recoverMock).not.toHaveBeenCalled();
  });
});
