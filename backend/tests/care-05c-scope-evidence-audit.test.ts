import { describe, expect, it, vi } from 'vitest';
import {
  auditCareGenericScopeRecords,
  type CareScopeAuditClient,
} from '../src/services/care/care-scope-evidence-audit';

const NOW = new Date('2026-09-29T11:00:00.000Z');

function mockDb() {
  const calls = {
    ride: vi.fn().mockResolvedValue({
      ride_type: 'care', service_category: 'CARE_ASSISTED',
      origin_neighborhood_id: 'synthetic-neighborhood',
    }),
    requirement: vi.fn().mockResolvedValue({ mode: 'ASSISTED' }),
    driver: vi.fn().mockResolvedValue({ vehicle_plate: 'ABC1D23' }),
    origin: vi.fn().mockResolvedValue({
      city: 'Example City', territory_id: 'synthetic-territory',
      territory: { uf: 'RJ' },
    }),
    regulation: vi.fn().mockResolvedValue({ id: 'synthetic-regulation' }),
    authorization: vi.fn().mockResolvedValue({ id: 'synthetic-car-authorization' }),
    coverage: vi.fn().mockResolvedValue({ id: 'synthetic-app-cover' }),
    enrollment: vi.fn().mockResolvedValue({ id: 'synthetic-driver-enrollment' }),
  };
  const db = {
    rides_v2: { findUnique: calls.ride },
    care_trip_requirements: { findUnique: calls.requirement },
    drivers: { findUnique: calls.driver },
    neighborhoods: { findUnique: calls.origin },
    municipal_regulations: { findFirst: calls.regulation },
    municipal_authorizations: { findFirst: calls.authorization },
    operational_insurance_coverages: { findFirst: calls.coverage },
    driver_insurance_enrollments: { findFirst: calls.enrollment },
  } as unknown as CareScopeAuditClient;
  return { db, calls };
}
const audit = (db: CareScopeAuditClient) =>
  auditCareGenericScopeRecords(db, 'synthetic-ride', 'synthetic-driver', NOW);

describe('CARE-05C — generic official records are never proof of CARE mode coverage', () => {
  it('never authorizes CARE despite every generic CAR/APP record appearing present', async () => {
    const { db, calls } = mockDb();
    expect(await audit(db)).toEqual({
      municipalAuthorized: false,
      insuranceConfirmedForMode: false,
      genericRecords: {
        carRegulationOnFile: true,
        driverCarAuthorizationOnFile: true,
        carInsuranceCoverageOnFile: true,
        providerEnrollmentOnFile: true,
      },
      reasons: [
        'CARE_SCOPE_MODE_SPECIFIC_REVIEW_REQUIRED',
        'CARE_MUNICIPAL_MODE_SCOPE_NOT_PROVEN',
        'CARE_INSURANCE_MODE_SCOPE_NOT_PROVEN',
      ],
    });
    expect(calls.regulation).toHaveBeenCalledWith({
      where: expect.objectContaining({ service_modality: 'CAR', is_active: true }),
      select: { id: true },
    });
    expect(calls.coverage).toHaveBeenCalledWith({
      where: expect.objectContaining({ modality: 'CAR_PASSENGER', status: 'ACTIVE' }),
      select: { id: true },
    });
  });

  it('never accepts a missing ordinary CAR regulation as implied CARE authorization', async () => {
    const { db, calls } = mockDb();
    calls.regulation.mockResolvedValue(null);
    calls.authorization.mockResolvedValue(null);
    const result = await audit(db);
    expect(result.municipalAuthorized).toBe(false);
    expect(result.genericRecords.carRegulationOnFile).toBe(false);
    expect(result.genericRecords.driverCarAuthorizationOnFile).toBe(false);
  });

  it('never accepts missing insurer coverage or mere driver enrollment as CARE insurance', async () => {
    const { db, calls } = mockDb();
    calls.coverage.mockResolvedValue(null);
    expect((await audit(db)).insuranceConfirmedForMode).toBe(false);
    expect((await audit(db)).genericRecords).toEqual(expect.objectContaining({
      carInsuranceCoverageOnFile: false,
      providerEnrollmentOnFile: true,
    }));
  });

  it('rejects CAR_NORMAL disguised as a CARE ride and mismatched mode', async () => {
    const { db, calls } = mockDb();
    calls.ride.mockResolvedValue({
      ride_type: 'care',
      service_category: 'CAR_NORMAL',
      origin_neighborhood_id: 'synthetic-neighborhood',
    });
    expect((await audit(db)).reasons).toContain('CARE_SCOPE_RIDE_OR_VEHICLE_INVALID');
    expect(calls.regulation).not.toHaveBeenCalled();

    calls.ride.mockResolvedValue({
      ride_type: 'care',
      service_category: 'CARE_ASSISTED',
      origin_neighborhood_id: 'synthetic-neighborhood',
    });
    calls.requirement.mockResolvedValue({ mode: 'ADAPTED_WHEELCHAIR' });
    expect((await audit(db)).reasons).toContain('CARE_SCOPE_RIDE_OR_VEHICLE_INVALID');
  });

  it('rejects missing neighborhood, state or vehicle data without broad lookup', async () => {
    const { db, calls } = mockDb();
    calls.origin.mockResolvedValue({ city: 'Example City', territory_id: null, territory: null });
    expect((await audit(db)).reasons).toContain('CARE_SCOPE_MUNICIPALITY_UNRESOLVED');
    expect(calls.regulation).not.toHaveBeenCalled();
    calls.driver.mockResolvedValue({ vehicle_plate: null });
    expect((await audit(db)).reasons).toContain('CARE_SCOPE_RIDE_OR_VEHICLE_INVALID');
  });

  it('fails closed for invalid timestamps, IDs or database failures', async () => {
    const { db, calls } = mockDb();
    expect((await auditCareGenericScopeRecords(db, '', 'driver', NOW)).reasons)
      .toContain('CARE_SCOPE_INPUT_INVALID');
    expect((await auditCareGenericScopeRecords(
      db, 'synthetic-ride', 'synthetic-driver', new Date('invalid'),
    )).reasons).toContain('CARE_SCOPE_INPUT_INVALID');
    calls.coverage.mockRejectedValue(new Error('synthetic-db-failure'));
    expect(await audit(db)).toMatchObject({
      municipalAuthorized: false,
      insuranceConfirmedForMode: false,
      reasons: expect.arrayContaining(['CARE_SCOPE_LOOKUP_FAILED']),
    });
  });
});
