import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    drivers: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    care_driver_qualifications: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    care_vehicle_capabilities: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return {
    prismaMock,
    authState: {
      admin: { id: 'admin-1', email: 'sa@test.local', role: 'SUPER_ADMIN' } as any,
    },
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => {
    if (!authState.admin) return res.status(401).json({ success: false });
    req.admin = authState.admin;
    req.userId = authState.admin.id;
    next();
  },
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
  allowReadAccess: (req: any, res: any, next: any) => {
    if (!req.admin) return res.status(401).json({ success: false });
    next();
  },
}));

vi.mock('../src/middlewares/territory-scope', () => ({
  applyTerritoryScope: (req: any, _res: any, next: any) => {
    req.territoryScope = { neighborhoodIds: ['nb-1'] };
    next();
  },
  requireTerritoryScope: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/modules/admin/approval-controller', () => ({
  ApprovalController: class {
    approveDriver = vi.fn();
  },
}));

vi.mock('../src/modules/admin/driver-admin-controller', () => ({
  DriverAdminController: class {
    verifyDocument = vi.fn();
    rejectDocument = vi.fn();
  },
}));

vi.mock('../src/config/s3-upload', () => ({
  uploadToS3: {
    single: () => (_req: any, _res: any, next: any) => next(),
    array: () => (_req: any, _res: any, next: any) => next(),
    fields: () => (_req: any, _res: any, next: any) => next(),
  },
}));

vi.mock('../src/services/financial-summary.service', () => ({ getDriverFinancialSummary: vi.fn() }));
vi.mock('../src/utils/audit', () => ({ createAuditLog: vi.fn(), audit: vi.fn() }));

const { default: adminDriversRoutes } = await import('../src/routes/admin-drivers');

const app = express();
app.use(express.json());
app.use('/api/admin', adminDriversRoutes);

const listDriver = {
  id: 'driver-care-1',
  name: 'Motorista CARE Lista',
  email: 'driver-care-list@test.local',
  phone: '+5521999999999',
  status: 'active',
  created_at: new Date('2026-10-01T10:00:00.000Z'),
  certidao_nada_consta_url: null,
  pix_key: null,
  pix_key_type: null,
  neighborhood_id: 'nb-1',
  vehicle_color: 'Prata',
  vehicle_model: 'Spin',
  vehicle_plate: 'ABC1D23',
  vehicle_type: 'CAR',
  neighborhoods: { name: 'Centro' },
  municipal_authorizations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'sa@test.local', role: 'SUPER_ADMIN' } as any;
  prismaMock.drivers.findMany.mockResolvedValue([]);
  prismaMock.drivers.count.mockResolvedValue(0);
  prismaMock.care_driver_qualifications.findMany.mockResolvedValue([]);
  prismaMock.care_vehicle_capabilities.findMany.mockResolvedValue([]);
});

describe('admin drivers CARE list filter', () => {
  it('GET /drivers?care=registered filtra motoristas com cadastro CARE e retorna resumo CARE', async () => {
    prismaMock.care_driver_qualifications.findMany
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1' }])
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1', status: 'VERIFIED' }]);

    prismaMock.care_vehicle_capabilities.findMany
      .mockResolvedValueOnce([{ driver_id: 'driver-care-2' }])
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1', status: 'PENDING' }]);

    prismaMock.drivers.findMany.mockResolvedValueOnce([listDriver]);
    prismaMock.drivers.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/admin/drivers?care=registered');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].careSummary).toEqual({
      hasQualification: true,
      qualificationStatus: 'VERIFIED',
      hasVehicle: true,
      vehicleStatus: 'PENDING',
      allVerified: false,
    });

    expect(prismaMock.drivers.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deleted_at: null,
        neighborhood_id: { in: ['nb-1'] },
        id: { in: ['driver-care-1', 'driver-care-2'] },
      }),
    }));
  });

  it('GET /drivers?care=all_verified filtra só qualificação e veículo verificados', async () => {
    prismaMock.care_driver_qualifications.findMany
      .mockResolvedValueOnce([
        { driver_id: 'driver-care-1' },
        { driver_id: 'driver-care-2' },
      ])
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1', status: 'VERIFIED' }]);

    prismaMock.care_vehicle_capabilities.findMany
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1' }])
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1', status: 'VERIFIED' }]);

    prismaMock.drivers.findMany.mockResolvedValueOnce([listDriver]);
    prismaMock.drivers.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/admin/drivers?care=all_verified');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].careSummary.allVerified).toBe(true);

    expect(prismaMock.care_vehicle_capabilities.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'VERIFIED',
        driver_id: { in: ['driver-care-1', 'driver-care-2'] },
      },
      select: { driver_id: true },
    }));

    expect(prismaMock.drivers.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['driver-care-1'] },
      }),
    }));
  });

  it('GET /drivers?care=invalido retorna 400 antes de consultar motoristas', async () => {
    const res = await request(app).get('/api/admin/drivers?care=invalido');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('care inválido');
    expect(prismaMock.drivers.findMany).not.toHaveBeenCalled();
  });
});
