import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, auditMock } = vi.hoisted(() => {
  const prismaMock: any = {
    municipal_regulations: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    municipal_regulation_requirements: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    operational_territories: {
      findMany: vi.fn(),
    },
    operational_insurance_coverages: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    driver_insurance_enrollments: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    neighborhoods: {
      findUnique: vi.fn(),
    },
    drivers: {
      findUnique: vi.fn(),
    },
    municipal_authorizations: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    municipal_package_audit_logs: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };

  return {
    prismaMock,
    authState: {
      admin: { id: 'admin-care', email: 'care-admin@example.invalid', role: 'SUPER_ADMIN' },
      scope: { territoryIds: ['33333333-3333-4333-8333-333333333333'], neighborhoodIds: [], accessLevel: 'full' },
    } as any,
    auditMock: vi.fn(),
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = authState.admin;
    req.userId = authState.admin.id;
    next();
  },
  allowReadAccess: (_req: any, _res: any, next: any) => next(),
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    next();
  },
  requireRole: (roles: string[]) => (req: any, res: any, next: any) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    next();
  },
}));
vi.mock('../src/middlewares/territory-scope', () => ({
  applyTerritoryScope: (req: any, _res: any, next: any) => {
    req.territoryScope = authState.scope;
    next();
  },
}));
vi.mock('../src/middlewares/require-territory-scope', () => ({
  requireTerritoryScope: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
  auditCtx: (req: any) => ({
    adminId: req.admin?.id || null,
    adminEmail: req.admin?.email || null,
    ip: '127.0.0.1',
    ua: 'care-06a-test',
  }),
}));
vi.mock('../src/services/municipal-regulation.service', () => ({
  MUNICIPAL_MODALITIES: [
    'CAR', 'MOTO_PASSENGER', 'MOTO_DELIVERY', 'TAXI', 'VAN',
    'CARE_ASSISTED', 'CARE_FOLDING_WHEELCHAIR', 'CARE_ADAPTED_WHEELCHAIR',
  ],
  normalizeCity: (value: string) => value.trim().replace(/\s+/g, ' '),
  normalizeState: (value: string) => value.trim().toUpperCase(),
  getMunicipalRegulation: vi.fn(),
}));
vi.mock('../src/services/driver-insurance.service', () => ({
  activatePrevilemosInsurance: vi.fn(),
  cancelPrevilemosInsurance: vi.fn(),
  listPrevilemosInsurance: vi.fn(),
  DriverInsuranceError: class DriverInsuranceError extends Error {
    statusCode = 400;
    code = 'TEST';
  },
}));
vi.mock('../src/services/previlemos-service', () => ({
  PrevilemosError: class PrevilemosError extends Error {
    statusCode = 502;
    safeMessage = 'provider error';
  },
}));

const { default: adminMunicipalRoutes } = await import('../src/routes/admin-municipal');
const { default: adminInsuranceCoverageRoutes } = await import('../src/routes/admin-insurance-coverages');
const { default: adminDriverInsuranceRoutes } = await import('../src/routes/admin-driver-insurance');

const municipalApp = express();
municipalApp.use(express.json());
municipalApp.use('/api/admin', adminMunicipalRoutes);

const coverageApp = express();
coverageApp.use(express.json());
coverageApp.use('/api/admin/insurance-coverages', adminInsuranceCoverageRoutes);

const driverInsuranceApp = express();
driverInsuranceApp.use(express.json());
driverInsuranceApp.use('/api/admin', adminDriverInsuranceRoutes);

const careRegulation = (overrides: any = {}) => ({
  id: 'reg-care',
  city: 'Cidade Exemplo',
  state: 'RJ',
  service_modality: 'CARE_ASSISTED',
  regulation_status: 'REGULATED',
  law_number: 'Lei 1',
  law_document_url: 'https://example.invalid/lei.pdf',
  requires_city_approval: true,
  requires_protocol: true,
  authorization_validity_months: 12,
  responsible_agency: 'Órgão Municipal',
  notes: null,
  is_active: false,
  care_scope_verified: false,
  care_scope_verified_at: null,
  care_scope_verified_by_admin_id: null,
  care_scope_document_url: null,
  requirements: [],
  updated_at: new Date('2026-09-28T12:00:00.000Z'),
  ...overrides,
});

const careCoverage = (overrides: any = {}) => ({
  id: 'coverage-care',
  territory_id: '33333333-3333-4333-8333-333333333333',
  modality: 'CARE_ASSISTED',
  provider_name: 'Seguradora Exemplo',
  policy_number: 'POL-001',
  coverage_type: 'APP',
  coverage_description: null,
  coverage_amount_death: null,
  coverage_amount_disability: null,
  coverage_amount_medical: null,
  valid_from: new Date('2026-09-01T00:00:00.000Z'),
  valid_until: new Date('2026-12-31T00:00:00.000Z'),
  status: 'DRAFT',
  document_url: 'https://example.invalid/endosso-care.pdf',
  notes: null,
  care_scope_verified: false,
  care_scope_verified_at: null,
  care_scope_verified_by_admin_id: null,
  created_by_admin_id: 'admin-care',
  updated_by_admin_id: 'admin-care',
  updated_at: new Date('2026-09-28T12:00:00.000Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-care', email: 'care-admin@example.invalid', role: 'SUPER_ADMIN' };
  authState.scope = { territoryIds: ['33333333-3333-4333-8333-333333333333'], neighborhoodIds: [], accessLevel: 'full' };

  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  prismaMock.$queryRaw.mockResolvedValue([{ id: 'locked' }]);
  prismaMock.$executeRaw.mockResolvedValue(1);
  prismaMock.driver_insurance_enrollments.findMany.mockResolvedValue([]);
  prismaMock.neighborhoods.findUnique.mockResolvedValue({
    is_active: true, is_verified: true, verified_at: new Date('2026-09-28T12:00:00.000Z'),
    verified_by: 'admin-territory', territory_id: '33333333-3333-4333-8333-333333333333',
  });
  prismaMock.municipal_regulation_requirements.createMany.mockResolvedValue({ count: 0 });
  prismaMock.municipal_regulation_requirements.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.operational_territories.findMany.mockResolvedValue([]);
  auditMock.mockResolvedValue(undefined);
});

describe('CARE-06A municipal scope review in existing admin module', () => {
  it('creates CARE municipal regulation inactive by default', async () => {
    prismaMock.municipal_regulations.create.mockImplementation(async ({ data }: any) => careRegulation(data));
    prismaMock.municipal_regulations.findUnique.mockImplementation(async () => careRegulation());

    const res = await request(municipalApp)
      .post('/api/admin/municipal-regulations')
      .send({
        city: 'Cidade Exemplo',
        state: 'RJ',
        service_modality: 'CARE_ASSISTED',
        regulation_status: 'REGULATED',
      });

    expect(res.status).toBe(201);
    expect(prismaMock.municipal_regulations.create).toHaveBeenCalled();
    expect(prismaMock.municipal_regulations.create.mock.calls[0][0].data.is_active).toBe(false);
  });

  it('refuses direct CARE activation before scope review', async () => {
    const res = await request(municipalApp)
      .post('/api/admin/municipal-regulations')
      .send({
        city: 'Cidade Exemplo',
        state: 'RJ',
        service_modality: 'CARE_ASSISTED',
        regulation_status: 'REGULATED',
        is_active: true,
      });

    expect(res.status).toBe(409);
    expect(prismaMock.municipal_regulations.create).not.toHaveBeenCalled();
  });

  it('records explicit SUPER_ADMIN documentary review without activating CARE', async () => {
    prismaMock.municipal_regulations.findUnique.mockResolvedValue(careRegulation());
    prismaMock.municipal_regulations.update.mockImplementation(async ({ data }: any) =>
      careRegulation({ ...data }),
    );

    const res = await request(municipalApp)
      .post('/api/admin/municipal-regulations/reg-care/care-scope-review')
      .send({ decision: 'APPROVE', document_url: 'https://example.invalid/parecer-care.pdf' });

    expect(res.status).toBe(200);
    const data = prismaMock.municipal_regulations.update.mock.calls[0][0].data;
    expect(data.care_scope_verified).toBe(true);
    expect(data.care_scope_verified_by_admin_id).toBe('admin-care');
    expect(data.care_scope_document_url).toContain('parecer-care.pdf');
    expect(data.is_active).toBeUndefined();
  });

  it('invalidates and deactivates prior CARE review when regulatory scope changes', async () => {
    prismaMock.municipal_regulations.findUnique
      .mockResolvedValueOnce(careRegulation({ is_active: true, care_scope_verified: true }))
      .mockResolvedValueOnce(careRegulation({ is_active: false, care_scope_verified: false }));
    prismaMock.municipal_regulations.update.mockImplementation(async ({ data }: any) =>
      careRegulation({ ...data }),
    );

    const res = await request(municipalApp)
      .patch('/api/admin/municipal-regulations/reg-care')
      .send({ law_number: 'Lei 2' });

    expect(res.status).toBe(200);
    const data = prismaMock.municipal_regulations.update.mock.calls[0][0].data;
    expect(data.care_scope_verified).toBe(false);
    expect(data.is_active).toBe(false);
  });
});

describe('CARE-06A insurance scope review in existing admin module', () => {
  it('creates CARE coverage only as territory-scoped non-active record', async () => {
    prismaMock.operational_insurance_coverages.create.mockImplementation(async ({ data }: any) =>
      careCoverage(data),
    );

    const active = await request(coverageApp)
      .post('/api/admin/insurance-coverages')
      .send({
        territory_id: '33333333-3333-4333-8333-333333333333',
        modality: 'CARE_ASSISTED',
        provider_name: 'Seguradora Exemplo',
        policy_number: 'POL-001',
        coverage_type: 'APP',
        valid_from: '2026-09-01',
        valid_until: '2026-12-31',
        status: 'ACTIVE',
        document_url: 'https://example.invalid/endosso-care.pdf',
      });
    expect(active.status).toBe(409);

    const draft = await request(coverageApp)
      .post('/api/admin/insurance-coverages')
      .send({
        territory_id: '33333333-3333-4333-8333-333333333333',
        modality: 'CARE_ASSISTED',
        provider_name: 'Seguradora Exemplo',
        policy_number: 'POL-001',
        coverage_type: 'APP',
        valid_from: '2026-09-01',
        valid_until: '2026-12-31',
        status: 'DRAFT',
        document_url: 'https://example.invalid/endosso-care.pdf',
      });
    expect(draft.status).toBe(201);
  });

  it('approves scope provenance but does not activate the coverage', async () => {
    prismaMock.operational_insurance_coverages.findUnique.mockResolvedValue(careCoverage());
    prismaMock.operational_insurance_coverages.update.mockImplementation(async ({ data }: any) =>
      careCoverage({ ...data }),
    );

    const res = await request(coverageApp)
      .post('/api/admin/insurance-coverages/coverage-care/care-scope-review')
      .send({ decision: 'APPROVE' });

    expect(res.status).toBe(200);
    const data = prismaMock.operational_insurance_coverages.update.mock.calls[0][0].data;
    expect(data.care_scope_verified).toBe(true);
    expect(data.care_scope_verified_by_admin_id).toBe('admin-care');
    expect(data.status).toBeUndefined();
  });

  it('suspends active CARE coverage when reviewed scope is revoked', async () => {
    prismaMock.operational_insurance_coverages.findUnique.mockResolvedValue(
      careCoverage({ status: 'ACTIVE', care_scope_verified: true }),
    );
    prismaMock.operational_insurance_coverages.update.mockImplementation(async ({ data }: any) =>
      careCoverage({ status: 'ACTIVE', care_scope_verified: true, ...data }),
    );

    const res = await request(coverageApp)
      .post('/api/admin/insurance-coverages/coverage-care/care-scope-review')
      .send({ decision: 'REVOKE', reason: 'Endosso cancelado' });

    expect(res.status).toBe(200);
    const data = prismaMock.operational_insurance_coverages.update.mock.calls[0][0].data;
    expect(data.care_scope_verified).toBe(false);
    expect(data.status).toBe('SUSPENDED');
  });
});

describe('CARE-06A explicit driver enrollment link', () => {
  it('links active driver enrollment only to reviewed CARE operational coverage', async () => {
    prismaMock.driver_insurance_enrollments.findFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      driver_id: 'driver-care',
      provider: 'PREVILEMOS',
      status: 'ACTIVE',
      vehicle_plate: 'ABC1D23',
      valid_from: new Date('2026-09-01T00:00:00.000Z'),
      valid_until: new Date('2026-12-31T00:00:00.000Z'),
      cancelled_at: null,
      provider_reference: 'POL-001',
      operational_coverage_id: null,
      operational_coverage_linked_at: null,
      operational_coverage_linked_by_admin_id: null,
    });
    prismaMock.drivers.findUnique.mockResolvedValue({ vehicle_plate: 'ABC-1D23', neighborhood_id: 'driver-n' });
    prismaMock.operational_insurance_coverages.findUnique.mockResolvedValue(
      careCoverage({
        id: '22222222-2222-4222-8222-222222222222',
        status: 'ACTIVE',
        care_scope_verified: true,
        care_scope_verified_at: new Date('2026-09-28T12:00:00.000Z'),
        care_scope_verified_by_admin_id: 'admin-care',
      }),
    );
    prismaMock.driver_insurance_enrollments.update.mockImplementation(async ({ data }: any) => ({
      id: '11111111-1111-4111-8111-111111111111',
      driver_id: 'driver-care',
      provider: 'PREVILEMOS',
      status: 'ACTIVE',
      vehicle_plate: 'ABC1D23',
      valid_from: new Date('2026-09-01T00:00:00.000Z'),
      valid_until: new Date('2026-12-31T00:00:00.000Z'),
      cancelled_at: null,
      provider_reference: 'POL-001',
      ...data,
    }));

    const res = await request(driverInsuranceApp)
      .post('/api/admin/drivers/driver-care/insurance/previlemos/11111111-1111-4111-8111-111111111111/operational-coverage')
      .send({ coverage_id: '22222222-2222-4222-8222-222222222222' });

    expect(res.status).toBe(200);
    const data = prismaMock.driver_insurance_enrollments.update.mock.calls[0][0].data;
    expect(data.operational_coverage_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(data.operational_coverage_linked_by_admin_id).toBe('admin-care');
    expect(data.operational_coverage_linked_at).toBeInstanceOf(Date);
  });

  it('does not link a certificate to an unrelated operational policy', async () => {
    prismaMock.driver_insurance_enrollments.findFirst.mockResolvedValue({
      driver_id: 'driver-care',
      vehicle_plate: 'ABC1D23',
      status: 'ACTIVE',
      cancelled_at: null,
      provider_reference: 'OTHER-POLICY',
      valid_from: new Date('2026-09-01T00:00:00.000Z'),
      valid_until: new Date('2026-12-31T00:00:00.000Z'),
    });
    prismaMock.drivers.findUnique.mockResolvedValue({ vehicle_plate: 'ABC-1D23', neighborhood_id: 'driver-n' });
    prismaMock.operational_insurance_coverages.findUnique.mockResolvedValue(
      careCoverage({
        status: 'ACTIVE', care_scope_verified: true,
        care_scope_verified_at: new Date('2026-09-28T12:00:00.000Z'),
        care_scope_verified_by_admin_id: 'admin-care',
      }),
    );
    const res = await request(driverInsuranceApp)
      .post('/api/admin/drivers/driver-care/insurance/previlemos/11111111-1111-4111-8111-111111111111/operational-coverage')
      .send({ coverage_id: '22222222-2222-4222-8222-222222222222' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CARE_POLICY_REFERENCE_MISMATCH');
    expect(prismaMock.driver_insurance_enrollments.update).not.toHaveBeenCalled();
  });
});
