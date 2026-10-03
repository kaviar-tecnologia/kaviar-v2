import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, txMock, authState, auditMock } = vi.hoisted(() => {
  const care_driver_qualifications = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  };

  const care_vehicle_capabilities = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  };

  const txMock: any = {
    care_driver_qualifications,
    care_vehicle_capabilities,
  };

  const prismaMock: any = {
    drivers: { findUnique: vi.fn() },
    care_driver_qualifications,
    care_vehicle_capabilities,
    $transaction: vi.fn((fn: any) => fn(txMock)),
  };

  return {
    prismaMock,
    txMock,
    auditMock: vi.fn(),
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
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    next();
  },
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
vi.mock('../src/utils/audit', () => ({
  createAuditLog: auditMock,
  audit: auditMock,
}));

const { default: adminDriversRoutes } = await import('../src/routes/admin-drivers');

const app = express();
app.use(express.json());
app.use('/api/admin', adminDriversRoutes);

const driver = {
  id: 'driver-care-1',
  name: 'Motorista CARE',
  status: 'active',
  neighborhood_id: 'nb-1',
  vehicle_plate: 'ABC1D23',
  vehicle_model: 'Spin',
  vehicle_color: 'Prata',
  vehicle_type: 'CAR',
  deleted_at: null,
  banned_at: null,
};

const qualification = {
  id: 'care-q-1',
  driver_id: driver.id,
  status: 'VERIFIED',
  assisted_training_verified: true,
  folding_training_verified: true,
  adapted_training_verified: false,
  valid_until: new Date('2027-12-31T23:59:59.000Z'),
  verified_at: new Date('2026-10-02T12:00:00.000Z'),
  verified_by_admin_id: 'admin-1',
};

const vehicle = {
  id: 'care-v-1',
  driver_id: driver.id,
  plate_snapshot: 'ABC1D23',
  status: 'VERIFIED',
  folding_storage_verified: true,
  ramp_or_lift_verified: false,
  wheelchair_restraint_verified: false,
  occupant_restraint_verified: false,
  adaptation_document_verified: false,
  wheelchair_capacity: 1,
  companion_seats: 2,
  inspection_valid_until: new Date('2027-12-31T23:59:59.000Z'),
  verified_at: new Date('2026-10-02T12:00:00.000Z'),
  verified_by_admin_id: 'admin-1',
};

beforeEach(() => {
  vi.clearAllMocks();

  authState.admin = { id: 'admin-1', email: 'sa@test.local', role: 'SUPER_ADMIN' } as any;

  prismaMock.drivers.findUnique.mockResolvedValue(driver);
  prismaMock.care_driver_qualifications.findUnique.mockResolvedValue(qualification);
  prismaMock.care_vehicle_capabilities.findUnique.mockResolvedValue(vehicle);

  txMock.care_driver_qualifications.findUnique.mockResolvedValue(qualification);
  txMock.care_vehicle_capabilities.findUnique.mockResolvedValue(vehicle);
  txMock.care_driver_qualifications.upsert.mockResolvedValue(qualification);
  txMock.care_vehicle_capabilities.upsert.mockResolvedValue(vehicle);

  prismaMock.$transaction.mockImplementation((fn: any) => fn(txMock));
  auditMock.mockResolvedValue(undefined);
});

describe('admin CARE capabilities preparation', () => {
  it('GET retorna capacidade CARE sem habilitar CARE oficial', async () => {
    const res = await request(app).get(`/api/admin/drivers/${driver.id}/care-capabilities`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.driver.id).toBe(driver.id);
    expect(res.body.data.qualification.id).toBe(qualification.id);
    expect(res.body.data.vehicle.id).toBe(vehicle.id);
    expect(res.body.data.officialCareEnabled).toBe(false);
    expect(res.body.data.note).toContain('Não habilita CARE_ASSISTED');

    expect(prismaMock.care_driver_qualifications.findUnique).toHaveBeenCalledWith({
      where: { driver_id: driver.id },
    });
    expect(prismaMock.care_vehicle_capabilities.findUnique).toHaveBeenCalledWith({
      where: { driver_id: driver.id },
    });
  });

  it('PATCH salva qualificação e veículo CARE com auditoria, sem habilitar CARE oficial', async () => {
    const res = await request(app)
      .patch(`/api/admin/drivers/${driver.id}/care-capabilities`)
      .send({
        qualification: {
          status: 'VERIFIED',
          assisted_training_verified: true,
          folding_training_verified: true,
          adapted_training_verified: false,
          valid_until: '2027-12-31T23:59:59.000Z',
        },
        vehicle: {
          status: 'VERIFIED',
          folding_storage_verified: true,
          ramp_or_lift_verified: false,
          wheelchair_restraint_verified: false,
          occupant_restraint_verified: false,
          adaptation_document_verified: false,
          wheelchair_capacity: 1,
          companion_seats: 2,
          inspection_valid_until: '2027-12-31T23:59:59.000Z',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.officialCareEnabled).toBe(false);
    expect(res.body.data.note).toContain('CARE_ASSISTED oficial continua bloqueado');

    expect(txMock.care_driver_qualifications.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { driver_id: driver.id },
      create: expect.objectContaining({
        driver_id: driver.id,
        status: 'VERIFIED',
        assisted_training_verified: true,
        folding_training_verified: true,
        adapted_training_verified: false,
        valid_until: expect.any(Date),
        verified_at: expect.any(Date),
        verified_by_admin_id: 'admin-1',
      }),
      update: expect.objectContaining({
        status: 'VERIFIED',
        assisted_training_verified: true,
        folding_training_verified: true,
        adapted_training_verified: false,
        valid_until: expect.any(Date),
        verified_at: expect.any(Date),
        verified_by_admin_id: 'admin-1',
      }),
    }));

    expect(txMock.care_vehicle_capabilities.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { driver_id: driver.id },
      create: expect.objectContaining({
        driver_id: driver.id,
        plate_snapshot: driver.vehicle_plate,
        status: 'VERIFIED',
        folding_storage_verified: true,
        wheelchair_capacity: 1,
        companion_seats: 2,
        inspection_valid_until: expect.any(Date),
        verified_at: expect.any(Date),
        verified_by_admin_id: 'admin-1',
      }),
      update: expect.objectContaining({
        plate_snapshot: driver.vehicle_plate,
        status: 'VERIFIED',
        folding_storage_verified: true,
        wheelchair_capacity: 1,
        companion_seats: 2,
        inspection_valid_until: expect.any(Date),
        verified_at: expect.any(Date),
        verified_by_admin_id: 'admin-1',
      }),
    }));

    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      adminEmail: 'sa@test.local',
      action: 'CARE_CAPABILITIES_UPDATE',
      entityType: 'driver',
      entityId: driver.id,
      newValue: expect.objectContaining({
        officialCareEnabled: false,
        changedQualification: true,
        changedVehicle: true,
      }),
    }));
  });

  it('PATCH bloqueia quem não é SUPER_ADMIN', async () => {
    authState.admin = { id: 'finance-1', email: 'fin@test.local', role: 'FINANCE' } as any;

    const res = await request(app)
      .patch(`/api/admin/drivers/${driver.id}/care-capabilities`)
      .send({ qualification: { status: 'VERIFIED' } });

    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('PATCH rejeita capacidade inválida antes de gravar', async () => {
    const res = await request(app)
      .patch(`/api/admin/drivers/${driver.id}/care-capabilities`)
      .send({ vehicle: { wheelchair_capacity: 99 } });

    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('GET retorna 404 para motorista inexistente', async () => {
    prismaMock.drivers.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/admin/drivers/missing-driver/care-capabilities');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
