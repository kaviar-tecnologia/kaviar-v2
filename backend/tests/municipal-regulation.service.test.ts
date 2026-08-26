import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    municipal_regulations: { findFirst: vi.fn(), findMany: vi.fn() },
    driver_documents: { findMany: vi.fn() },
    municipal_authorizations: { findMany: vi.fn() },
    driver_modalities: { findUnique: vi.fn() },
    drivers: { findUnique: vi.fn() },
    municipal_regulatory_driver_protocols: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import {
  MUNICIPAL_AUTHORIZATION_EXPIRING_SOON_DAYS,
  addCalendarMonthsUtc,
  canDriverOperateInMunicipality,
  evaluateMunicipalAuthorizationValidity,
  evaluateDriverRegulatoryCompatibility,
  getDriverMunicipalStatus,
  getMunicipalRegulation,
} from '../src/services/municipal-regulation.service';

const mockFindRegulation = prisma.municipal_regulations.findFirst as ReturnType<typeof vi.fn>;
const mockFindRegulations = prisma.municipal_regulations.findMany as ReturnType<typeof vi.fn>;
const mockFindDocuments = prisma.driver_documents.findMany as ReturnType<typeof vi.fn>;
const mockFindAuthorization = prisma.municipal_authorizations.findMany as ReturnType<typeof vi.fn>;
const mockFindDriverModality = prisma.driver_modalities.findUnique as ReturnType<typeof vi.fn>;
const mockFindDriver = prisma.drivers.findUnique as ReturnType<typeof vi.fn>;
const mockFindExistingProtocol = prisma.municipal_regulatory_driver_protocols.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFindRegulations.mockResolvedValue([]);
  mockFindDocuments.mockResolvedValue([]);
  mockFindAuthorization.mockResolvedValue([]);
  mockFindDriverModality.mockResolvedValue(null);
  mockFindExistingProtocol.mockResolvedValue(null);
});

describe('municipal regulation service', () => {
  it('evaluateMunicipalAuthorizationValidity retorna ACTIVE quando aprovação não tem prazo final', () => {
    const result = evaluateMunicipalAuthorizationValidity({
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: null,
      now: new Date('2026-07-12T12:00:00.000Z'),
    });

    expect(result.state).toBe('ACTIVE');
    expect(result.isOperationallyValid).toBe(true);
    expect(result.daysUntilExpiry).toBeNull();
    expect(result.validUntil).toBeNull();
  });

  it('evaluateMunicipalAuthorizationValidity retorna ACTIVE para prazo acima de 30 dias', () => {
    const result = evaluateMunicipalAuthorizationValidity({
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: new Date('2026-09-30T00:00:00.000Z'),
      now: new Date('2026-07-12T10:00:00.000Z'),
    });

    expect(result.state).toBe('ACTIVE');
    expect(result.isOperationallyValid).toBe(true);
    expect(result.daysUntilExpiry).toBeGreaterThan(MUNICIPAL_AUTHORIZATION_EXPIRING_SOON_DAYS);
  });

  it('evaluateMunicipalAuthorizationValidity retorna EXPIRING_SOON quando faltam exatamente 30 dias', () => {
    const result = evaluateMunicipalAuthorizationValidity({
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: new Date('2026-08-11T00:00:00.000Z'),
      now: new Date('2026-07-12T09:00:00.000Z'),
    });

    expect(result.state).toBe('EXPIRING_SOON');
    expect(result.isOperationallyValid).toBe(true);
    expect(result.daysUntilExpiry).toBe(30);
  });

  it('evaluateMunicipalAuthorizationValidity mantém validade operacional no mesmo dia (semântica date-only)', () => {
    const result = evaluateMunicipalAuthorizationValidity({
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: new Date('2026-07-12T00:00:00.000Z'),
      now: new Date('2026-07-12T23:30:00.000Z'),
    });

    expect(result.state).toBe('EXPIRING_SOON');
    expect(result.isOperationallyValid).toBe(true);
    expect(result.daysUntilExpiry).toBe(0);
  });

  it('evaluateMunicipalAuthorizationValidity retorna EXPIRED quando validade foi ontem', () => {
    const result = evaluateMunicipalAuthorizationValidity({
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: new Date('2026-07-11T00:00:00.000Z'),
      now: new Date('2026-07-12T08:00:00.000Z'),
    });

    expect(result.state).toBe('EXPIRED');
    expect(result.isOperationallyValid).toBe(false);
    expect(result.daysUntilExpiry).toBe(-1);
  });

  it('evaluateMunicipalAuthorizationValidity retorna INACTIVE para status diferente de APPROVED_BY_CITY_HALL', () => {
    const result = evaluateMunicipalAuthorizationValidity({
      status: 'DOCUMENTS_PENDING',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: null,
      now: new Date('2026-07-12T08:00:00.000Z'),
    });

    expect(result.state).toBe('INACTIVE');
    expect(result.isOperationallyValid).toBe(false);
  });

  it('evaluateMunicipalAuthorizationValidity retorna INACTIVE sem approved_by_admin_id', () => {
    const result = evaluateMunicipalAuthorizationValidity({
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: null,
      authorization_valid_until: null,
      now: new Date('2026-07-12T08:00:00.000Z'),
    });

    expect(result.state).toBe('INACTIVE');
    expect(result.isOperationallyValid).toBe(false);
  });

  it('addCalendarMonthsUtc aplica clamp para último dia do mês', () => {
    expect(addCalendarMonthsUtc(new Date('2026-01-31T00:00:00.000Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addCalendarMonthsUtc(new Date('2024-01-31T00:00:00.000Z'), 1).toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(addCalendarMonthsUtc(new Date('2026-07-12T00:00:00.000Z'), 12).toISOString()).toBe('2027-07-12T00:00:00.000Z');
  });

  it('getMunicipalRegulation retorna regra ativa da cidade/modalidade', async () => {
    mockFindRegulation.mockResolvedValue({ id: 'reg-1', city: 'Santa Rita do Passa Quatro', state: 'SP', service_modality: 'CAR', requirements: [] });

    const result = await getMunicipalRegulation('Santa Rita do Passa Quatro', 'sp', 'CAR');

    expect(result?.id).toBe('reg-1');
    expect(mockFindRegulation).toHaveBeenCalled();
  });

  it('getDriverMunicipalStatus retorna NOT_REQUIRED quando não há regra ativa', async () => {
    mockFindRegulation.mockResolvedValue(null);

    const result = await getDriverMunicipalStatus('driver-1', 'Cidade Livre', 'SP', 'CAR');

    expect(result.hasRegulation).toBe(false);
    expect(result.canOperateMunicipally).toBe(true);
    expect(result.municipalStatus).toBe('NOT_REQUIRED');
  });

  it('getDriverMunicipalStatus bloqueia quando status da regra é REQUIRES_CONFIRMATION', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-2',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'MOTO_PASSENGER',
      regulation_status: 'REQUIRES_CONFIRMATION',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindAuthorization.mockResolvedValue([]);

    const result = await getDriverMunicipalStatus('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'MOTO_PASSENGER');

    expect(result.hasRegulation).toBe(true);
    expect(result.canOperateMunicipally).toBe(false);
    expect(result.municipalStatus).toBe('REQUIRES_CONFIRMATION');
  });

  it('canDriverOperateInMunicipality bloqueia motorista não aprovado pela KAVIAR', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'pending' });

    const result = await canDriverOperateInMunicipality('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/KAVIAR/i);
  });

  it('canDriverOperateInMunicipality bloqueia quando autorização municipal ainda não está aprovada', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindDocuments.mockResolvedValue([]);
    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-1',
      status: 'DOCUMENTS_PENDING',
      authorization_valid_until: null,
      approved_by_admin_id: null,
      created_at: new Date('2026-07-12T10:00:00.000Z'),
      regulation: {
        id: 'reg-1',
        requires_city_approval: true,
        requirements: [],
      },
    }]);

    const result = await canDriverOperateInMunicipality('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/autorização municipal/i);
  });

  it('canDriverOperateInMunicipality libera mesmo com documentos municipais pendentes quando aprovação final foi confirmada por Admin', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [
        {
          id: 'req-1',
          requirement_key: 'CNH_B_EAR',
          label: 'CNH categoria B ou superior com EAR',
          description: null,
          document_type: 'CNH',
          is_required: true,
          applies_when: null,
          sort_order: 1,
        },
        {
          id: 'req-2',
          requirement_key: 'PROFILE_PHOTO',
          label: '2 fotos 3x4 ou foto padrão documento',
          description: null,
          document_type: 'PROFILE_PHOTO',
          is_required: true,
          applies_when: null,
          sort_order: 2,
        },
      ],
    });
    mockFindDocuments.mockResolvedValue([]);

    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-2',
      status: 'APPROVED_BY_CITY_HALL',
      authorization_valid_until: null,
      approved_by_admin_id: 'admin-1',
      created_at: new Date('2026-07-12T10:00:00.000Z'),
      regulation: {
        id: 'reg-1',
        requires_city_approval: true,
        requirements: [],
      },
    }]);

    const result = await canDriverOperateInMunicipality('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.municipal?.missingDocumentTypes).toEqual(['CNH', 'PROFILE_PHOTO']);
  });

  it('canDriverOperateInMunicipality não libera aprovação sem confirmação do Admin', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindDocuments.mockResolvedValue([]);
    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-3',
      status: 'APPROVED_BY_CITY_HALL',
      authorization_valid_until: null,
      approved_by_admin_id: null,
      created_at: new Date('2026-07-12T10:00:00.000Z'),
      regulation: {
        id: 'reg-1',
        requires_city_approval: true,
        requirements: [],
      },
    }]);

    const result = await canDriverOperateInMunicipality('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/autorização municipal/i);
  });

  it('canDriverOperateInMunicipality aceita status APPROVED/ACTIVE em caixa alta', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'APPROVED' });
    mockFindRegulation.mockResolvedValue(null);

    const resultApproved = await canDriverOperateInMunicipality('driver-1', 'Cidade Livre', 'SP', 'CAR');

    expect(resultApproved.allowed).toBe(true);

    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'ACTIVE' });
    const resultActive = await canDriverOperateInMunicipality('driver-1', 'Cidade Livre', 'SP', 'CAR');

    expect(resultActive.allowed).toBe(true);
  });

  it('getDriverMunicipalStatus bloqueia autorização vencida com reason específico', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindDocuments.mockResolvedValue([]);
    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-expired',
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: new Date('2020-01-01T00:00:00.000Z'),
      created_at: new Date('2026-07-12T10:00:00.000Z'),
      regulation: {
        id: 'reg-1',
        requires_city_approval: true,
        requirements: [],
      },
    }]);

    const result = await getDriverMunicipalStatus('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.authorizationValidityState).toBe('EXPIRED');
    expect(result.canOperateMunicipally).toBe(false);
    expect(result.reason).toBe('Autorização municipal vencida.');
  });

  it('canDriverOperateInMunicipality bloqueia autorização vencida', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindDocuments.mockResolvedValue([]);
    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-expired',
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: new Date('2020-01-01T00:00:00.000Z'),
      created_at: new Date('2026-07-12T10:00:00.000Z'),
      regulation: {
        id: 'reg-1',
        requires_city_approval: true,
        requirements: [],
      },
    }]);

    const result = await canDriverOperateInMunicipality('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Autorização municipal vencida.');
  });

  it('canDriverOperateInMunicipality permite operação para autorização expiring soon', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindDocuments.mockResolvedValue([]);
    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-expiring',
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: new Date('2999-12-31T00:00:00.000Z'),
      created_at: new Date('2026-07-12T10:00:00.000Z'),
      regulation: {
        id: 'reg-1',
        requires_city_approval: true,
        requirements: [],
      },
    }]);

    const result = await canDriverOperateInMunicipality('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(['ACTIVE', 'EXPIRING_SOON']).toContain(result.municipal?.authorizationValidityState);
  });

  it('getDriverMunicipalStatus escolhe autorizacao valida mais recente', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindAuthorization.mockResolvedValue([
      {
        id: 'auth-new',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: new Date('2999-01-01T00:00:00.000Z'),
        created_at: new Date('2026-07-12T12:00:00.000Z'),
      },
      {
        id: 'auth-old',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: null,
        created_at: new Date('2026-07-01T12:00:00.000Z'),
      },
    ]);

    const result = await getDriverMunicipalStatus('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.authorization?.id).toBe('auth-new');
    expect(result.canOperateMunicipally).toBe(true);
  });

  it('getDriverMunicipalStatus ignora expirada antiga quando existe nova ativa', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindAuthorization.mockResolvedValue([
      {
        id: 'auth-active-new',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: null,
        created_at: new Date('2026-07-12T12:00:00.000Z'),
      },
      {
        id: 'auth-expired-old',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: new Date('2020-01-01T00:00:00.000Z'),
        created_at: new Date('2026-06-01T12:00:00.000Z'),
      },
    ]);

    const result = await getDriverMunicipalStatus('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.authorization?.id).toBe('auth-active-new');
    expect(result.authorizationValidityState).toBe('ACTIVE');
    expect(result.canOperateMunicipally).toBe(true);
  });

  it('getDriverMunicipalStatus escolhe EXPIRING_SOON mais recente', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindAuthorization.mockResolvedValue([
      {
        id: 'auth-expiring-new',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: new Date('2099-01-01T00:00:00.000Z'),
        created_at: new Date('2026-07-12T12:00:00.000Z'),
      },
      {
        id: 'auth-expired-old',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: new Date('2020-01-01T00:00:00.000Z'),
        created_at: new Date('2026-06-01T12:00:00.000Z'),
      },
    ]);

    const result = await getDriverMunicipalStatus('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.authorization?.id).toBe('auth-expiring-new');
    expect(['ACTIVE', 'EXPIRING_SOON']).toContain(result.authorizationValidityState);
    expect(result.canOperateMunicipally).toBe(true);
  });

  it('getDriverMunicipalStatus sem valida escolhe EXPIRED mais recente para estado', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindAuthorization.mockResolvedValue([
      {
        id: 'auth-inactive-new',
        status: 'DOCUMENTS_PENDING',
        approved_by_admin_id: null,
        authorization_valid_until: null,
        created_at: new Date('2026-07-12T12:00:00.000Z'),
      },
      {
        id: 'auth-expired-mid',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: new Date('2020-01-05T00:00:00.000Z'),
        created_at: new Date('2026-07-10T12:00:00.000Z'),
      },
      {
        id: 'auth-expired-old',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: new Date('2020-01-01T00:00:00.000Z'),
        created_at: new Date('2026-06-01T12:00:00.000Z'),
      },
    ]);

    const result = await getDriverMunicipalStatus('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.authorization?.id).toBe('auth-expired-mid');
    expect(result.authorizationValidityState).toBe('EXPIRED');
    expect(result.canOperateMunicipally).toBe(false);
  });

  it('canDriverOperateInMunicipality usa autorizacao atual selecionada', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });
    mockFindRegulation.mockResolvedValue({
      id: 'reg-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requirements: [],
    });
    mockFindAuthorization.mockResolvedValue([
      {
        id: 'auth-current-expired',
        status: 'APPROVED_BY_CITY_HALL',
        approved_by_admin_id: 'admin-1',
        authorization_valid_until: new Date('2020-01-01T00:00:00.000Z'),
        created_at: new Date('2026-07-12T12:00:00.000Z'),
      },
      {
        id: 'auth-old-active',
        status: 'DOCUMENTS_PENDING',
        approved_by_admin_id: null,
        authorization_valid_until: null,
        created_at: new Date('2026-06-01T12:00:00.000Z'),
      },
    ]);

    const result = await canDriverOperateInMunicipality('driver-1', 'Santa Rita do Passa Quatro', 'SP', 'CAR');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Autorização municipal vencida.');
    expect(result.municipal?.authorization?.id).toBe('auth-current-expired');
  });

  it('canDriverOperateInMunicipality mantém cidade sem regra como permitida', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });
    mockFindRegulation.mockResolvedValue(null);

    const result = await canDriverOperateInMunicipality('driver-1', 'Cidade Livre', 'SP', 'CAR');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.municipal?.municipalStatus).toBe('NOT_REQUIRED');
  });

  it('avalia COMPATIBLE para motorista aprovado da mesma cidade com modalidade e documentos mínimos', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([
      {
        service_modality: 'CAR',
        requirements: [
          { is_required: true, document_type: 'CNH' },
          { is_required: true, document_type: 'CRLV' },
        ],
      },
    ]);
    mockFindDocuments.mockResolvedValue([
      { type: 'CNH', status: 'SUBMITTED' },
      { type: 'CRLV', status: 'VERIFIED' },
    ]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('COMPATIBLE');
    expect(result.compatible).toBe(true);
    expect(result.cityMatch).toBe(true);
    expect(result.approvedModalities).toEqual(['CAR']);
    expect(result.compatibleModalities).toEqual(['CAR']);
    expect(result.documentSummary.required).toBe(2);
    expect(result.documentSummary.submitted).toBe(1);
    expect(result.documentSummary.verified).toBe(1);
    expect(result.documentSummary.missing).toBe(0);
  });

  it('retorna INCOMPATIBLE quando motorista está vinculado a outra cidade', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Campinas',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([{ service_modality: 'CAR', requirements: [] }]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('INCOMPATIBLE');
    expect(result.reasons).toContain('Motorista vinculado a outra cidade.');
  });

  it('retorna REVIEW_REQUIRED quando cidade/UF do motorista não podem ser resolvidas', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: null,
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([{ service_modality: 'CAR', requirements: [] }]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.cityMatch).toBe(false);
    expect(result.reasons).toContain('Cidade do motorista não pôde ser confirmada pelo cadastro KAVIAR.');
  });

  it('retorna INCOMPATIBLE quando não há modalidade aprovada', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [],
    });

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('INCOMPATIBLE');
    expect(result.reasons).toContain('Motorista não possui modalidade aprovada pela KAVIAR.');
  });

  it('não considera modalidade PENDING_REVIEW como aprovada', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'PENDING_REVIEW' }],
    });

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.approvedModalities).toEqual([]);
    expect(result.status).toBe('INCOMPATIBLE');
  });

  it('não considera modalidade REJECTED como aprovada', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'REJECTED' }],
    });

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.approvedModalities).toEqual([]);
    expect(result.status).toBe('INCOMPATIBLE');
  });

  it('conta documento SUBMITTED como disponível para criação inicial do protocolo', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([
      {
        service_modality: 'CAR',
        requirements: [{ is_required: true, document_type: 'CNH' }],
      },
    ]);
    mockFindDocuments.mockResolvedValue([{ type: 'CNH', status: 'SUBMITTED' }]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('COMPATIBLE');
    expect(result.documentSummary.submitted).toBe(1);
    expect(result.documentSummary.missing).toBe(0);
  });

  it('conta documento VERIFIED como disponível para criação inicial do protocolo', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([
      {
        service_modality: 'CAR',
        requirements: [{ is_required: true, document_type: 'CNH' }],
      },
    ]);
    mockFindDocuments.mockResolvedValue([{ type: 'CNH', status: 'VERIFIED' }]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('COMPATIBLE');
    expect(result.documentSummary.verified).toBe(1);
    expect(result.documentSummary.missing).toBe(0);
  });

  it('retorna INCOMPATIBLE quando há documento obrigatório ausente', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([
      {
        service_modality: 'CAR',
        requirements: [
          { is_required: true, document_type: 'CNH' },
          { is_required: true, document_type: 'CRLV' },
        ],
      },
    ]);
    mockFindDocuments.mockResolvedValue([{ type: 'CNH', status: 'SUBMITTED' }]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('INCOMPATIBLE');
    expect(result.reasons).toContain('Motorista possui documentos obrigatórios pendentes para esta cidade.');
    expect(result.documentSummary.missing).toBe(1);
    expect(result.documentSummary.missingDocumentTypes).toEqual(['CRLV']);
  });

  it('não bloqueia por requisito opcional', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([
      {
        service_modality: 'CAR',
        requirements: [
          { is_required: false, document_type: 'PHOTO' },
          { is_required: true, document_type: 'CNH' },
        ],
      },
    ]);
    mockFindDocuments.mockResolvedValue([{ type: 'CNH', status: 'SUBMITTED' }]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('COMPATIBLE');
    expect(result.documentSummary.required).toBe(1);
  });

  it('não inclui no resumo requisito obrigatório sem document_type', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([
      {
        service_modality: 'CAR',
        requirements: [
          { is_required: true, document_type: null },
          { is_required: true, document_type: 'CNH' },
        ],
      },
    ]);
    mockFindDocuments.mockResolvedValue([{ type: 'CNH', status: 'SUBMITTED' }]);

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.documentSummary.required).toBe(1);
    expect(result.documentSummary.missing).toBe(0);
    expect(result.status).toBe('COMPATIBLE');
  });

  it('retorna INCOMPATIBLE quando protocolo já existe para case_id + driver_id', async () => {
    mockFindDriver.mockResolvedValue({
      neighborhoods: {
        city: 'Santa Rita do Passa Quatro',
        territory: { uf: 'SP' },
      },
      driver_modalities: [{ modality: 'CAR', status: 'APPROVED' }],
    });
    mockFindRegulations.mockResolvedValue([{ service_modality: 'CAR', requirements: [] }]);
    mockFindExistingProtocol.mockResolvedValue({ id: 'protocol-1' });

    const result = await evaluateDriverRegulatoryCompatibility('driver-1', 'Santa Rita do Passa Quatro', 'SP', { caseId: 'case-1' });

    expect(result.status).toBe('INCOMPATIBLE');
    expect(result.reasons).toContain('Este motorista já possui protocolo nesta cidade.');
  });

  it('bloqueia operação municipal quando veículo excede idade máxima por ano de fabricação', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-age-1',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: false,
      max_vehicle_age_years: 12,
      vehicle_age_basis: 'MANUFACTURE_YEAR',
      requirements: [],
    });

    mockFindDriverModality.mockResolvedValue({
      driver_id: 'driver-1',
      modality: 'CAR',
      vehicle_year: 2010,
    });

    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-age-1',
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: null,
      created_at: new Date('2026-07-12T10:00:00.000Z'),
    }]);

    const result = await getDriverMunicipalStatus(
      'driver-1',
      'Santa Rita do Passa Quatro',
      'SP',
      'CAR',
    );

    expect(result.canOperateMunicipally).toBe(false);
    expect(result.reason).toMatch(/idade.*veículo/i);
  });

  it('permite regra de idade quando veículo está dentro do limite por ano de fabricação', async () => {
    const currentYear = new Date().getFullYear();

    mockFindRegulation.mockResolvedValue({
      id: 'reg-age-2',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: false,
      max_vehicle_age_years: 12,
      vehicle_age_basis: 'MANUFACTURE_YEAR',
      requirements: [],
    });

    mockFindDriverModality.mockResolvedValue({
      driver_id: 'driver-1',
      modality: 'CAR',
      vehicle_year: currentYear - 5,
    });

    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-age-2',
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: null,
      created_at: new Date('2026-07-12T10:00:00.000Z'),
    }]);

    const result = await getDriverMunicipalStatus(
      'driver-1',
      'Santa Rita do Passa Quatro',
      'SP',
      'CAR',
    );

    expect(result.canOperateMunicipally).toBe(true);
  });

  it('exige revisão quando há limite de idade mas ano do veículo não está informado', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-age-3',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: false,
      max_vehicle_age_years: 12,
      vehicle_age_basis: 'MANUFACTURE_YEAR',
      requirements: [],
    });

    mockFindDriverModality.mockResolvedValue({
      driver_id: 'driver-1',
      modality: 'CAR',
      vehicle_year: null,
    });

    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-age-3',
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: null,
      created_at: new Date('2026-07-12T10:00:00.000Z'),
    }]);

    const result = await getDriverMunicipalStatus(
      'driver-1',
      'Santa Rita do Passa Quatro',
      'SP',
      'CAR',
    );

    expect(result.canOperateMunicipally).toBe(false);
    expect(result.reason).toMatch(/ano do veículo/i);
  });

  it('exige revisão quando critério de idade depende de dado não armazenado', async () => {
    mockFindRegulation.mockResolvedValue({
      id: 'reg-age-4',
      city: 'Cidade Modelo',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: false,
      max_vehicle_age_years: 10,
      vehicle_age_basis: 'FIRST_REGISTRATION',
      requirements: [],
    });

    mockFindDriverModality.mockResolvedValue({
      driver_id: 'driver-1',
      modality: 'CAR',
      vehicle_year: 2020,
    });

    mockFindAuthorization.mockResolvedValue([{
      id: 'auth-age-4',
      status: 'APPROVED_BY_CITY_HALL',
      approved_by_admin_id: 'admin-1',
      authorization_valid_until: null,
      created_at: new Date('2026-07-12T10:00:00.000Z'),
    }]);

    const result = await getDriverMunicipalStatus(
      'driver-1',
      'Cidade Modelo',
      'SP',
      'CAR',
    );

    expect(result.canOperateMunicipally).toBe(false);
    expect(result.reason).toMatch(/revisão/i);
  });

  it('canDriverOperateInMunicipality bloqueia motorista aprovado quando veículo excede idade máxima municipal', async () => {
    mockFindDriver.mockResolvedValue({ id: 'driver-1', status: 'approved' });

    mockFindRegulation.mockResolvedValue({
      id: 'reg-age-gate',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: false,
      max_vehicle_age_years: 12,
      vehicle_age_basis: 'MANUFACTURE_YEAR',
      requirements: [],
    });

    mockFindDriverModality.mockResolvedValue({
      driver_id: 'driver-1',
      modality: 'CAR',
      vehicle_year: 2010,
    });

    const result = await canDriverOperateInMunicipality(
      'driver-1',
      'Santa Rita do Passa Quatro',
      'SP',
      'CAR',
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/idade.*veículo/i);
    expect(result.municipal?.canOperateMunicipally).toBe(false);
  });

});
