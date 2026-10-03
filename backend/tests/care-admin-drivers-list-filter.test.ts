import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    drivers: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    care_driver_qualifications: {
      findMany: vi.fn(),
    },
    care_vehicle_capabilities: {
      findMany: vi.fn(),
    },
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
  applyTerritoryScope: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/middlewares/audit-write', () => ({
  auditWrite: () => (_req: any, _res: any, next: any) => next(),
}));

const { adminApprovalRoutes } = await import('../src/routes/admin-approval');

const app = express();
app.use(express.json());
app.use('/api/admin', adminApprovalRoutes);

const listDriver = {
  id: 'driver-care-1',
  name: 'Motorista CARE Lista',
  email: 'driver-care-list@test.local',
  phone: '+5521999999999',
  status: 'approved',
  document_cpf: null,
  document_rg: null,
  document_cnh: null,
  vehicle_plate: 'ABC1D23',
  vehicle_model: 'Spin',
  vehicle_color: 'Prata',
  vehicle_type: 'CAR',
  neighborhood_id: 'nb-1',
  community_id: null,
  pending_reason: null,
  created_at: new Date('2026-10-01T10:00:00.000Z'),
  updated_at: new Date('2026-10-01T10:00:00.000Z'),
  approved_at: new Date('2026-10-01T10:00:00.000Z'),
  rejected_at: null,
  neighborhoods: { name: 'Centro' },
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'sa@test.local', role: 'SUPER_ADMIN' } as any;
  prismaMock.drivers.findMany.mockResolvedValue([]);
  prismaMock.care_driver_qualifications.findMany.mockResolvedValue([]);
  prismaMock.care_vehicle_capabilities.findMany.mockResolvedValue([]);
});

describe('admin approval drivers CARE list filter', () => {
  it('GET /api/admin/drivers?care=registered filtra na rota real e retorna careSummary', async () => {
    prismaMock.care_driver_qualifications.findMany
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1' }])
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1', status: 'VERIFIED' }]);

    prismaMock.care_vehicle_capabilities.findMany
      .mockResolvedValueOnce([{ driver_id: 'driver-care-2' }])
      .mockResolvedValueOnce([{ driver_id: 'driver-care-1', status: 'PENDING' }]);

    prismaMock.drivers.findMany.mockResolvedValueOnce([listDriver]);

    const res = await request(app).get('/api/admin/drivers?status=approved&care=registered');

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
        status: 'approved',
        id: { in: ['driver-care-1', 'driver-care-2'] },
      }),
    }));
  });

  it('GET /api/admin/drivers?care=all_verified filtra só quem tem qualificação e veículo verificados', async () => {
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

    const res = await request(app).get('/api/admin/drivers?status=approved&care=all_verified');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].careSummary.allVerified).toBe(true);

    expect(prismaMock.drivers.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deleted_at: null,
        status: 'approved',
        id: { in: ['driver-care-1'] },
      }),
    }));
  });

  it('GET /api/admin/drivers?care=invalido retorna 400 antes de consultar motoristas', async () => {
    const res = await request(app).get('/api/admin/drivers?care=invalido');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('care inválido');
    expect(prismaMock.drivers.findMany).not.toHaveBeenCalled();
  });
});
