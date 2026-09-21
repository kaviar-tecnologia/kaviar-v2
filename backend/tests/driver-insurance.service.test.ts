import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  driverFindUnique: vi.fn(),
  insuranceFindUnique: vi.fn(),
  insuranceFindFirst: vi.fn(),
  insuranceFindMany: vi.fn(),
  insuranceCreate: vi.fn(),
  insuranceUpdate: vi.fn(),
  insuranceUpdateMany: vi.fn(),
  createPrevilemosInsurance: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    drivers: {
      findUnique: mocks.driverFindUnique,
    },
    driver_insurance_enrollments: {
      findUnique: mocks.insuranceFindUnique,
      findFirst: mocks.insuranceFindFirst,
      findMany: mocks.insuranceFindMany,
      create: mocks.insuranceCreate,
      update: mocks.insuranceUpdate,
      updateMany: mocks.insuranceUpdateMany,
    },
  },
}));

vi.mock('../src/services/previlemos-service', async () => {
  const actual = await vi.importActual<any>(
    '../src/services/previlemos-service'
  );

  return {
    ...actual,
    createPrevilemosInsurance:
      mocks.createPrevilemosInsurance,
  };
});

import {
  activatePrevilemosInsurance,
  cancelPrevilemosInsurance,
  DriverInsuranceError,
} from '../src/services/driver-insurance.service';

import {
  PrevilemosError,
} from '../src/services/previlemos-service';

const driver = {
  id: 'driver-1',
  name: 'Motorista Teste',
  email: 'motorista@example.com',
  phone: '21999999999',
  status: 'approved',
  document_cpf: '12345678901',
  vehicle_plate: 'ABC1D23',
  vehicle_model: 'ARGO',
};

const activationInput = {
  dataInicial: '2026-09-21',
  dataFinal: '2026-10-21',
  dataNascimento: '1990-01-10',
  endereco: {
    Logradouro: 'Rua Teste',
    Numero: '100',
    Bairro: 'Centro',
    Cidade: 'Rio de Janeiro',
    Uf: 'RJ',
    Cep: '20000000',
  },
  veiculo: {
    Marca: 'FIAT',
    AnoFabricacao: 2024,
    AnoModelo: 2025,
    Chassi: 'TESTECHASSI1234567',
    Renavam: '12345678901',
  },
};

const providerResponse = {
  NumSeguro: 3482777,
  TipoSeguro: 'APP - Acidente Pessoal de Passageiro',
  DataInicial: '2026-09-21T00:00:00',
  DataFinal: '2026-10-21T00:00:00',
  Produtor: 'KAVIAR TECNOLOGIA - HML',
  Segurado: 'MOTORISTA TESTE',
  Pago: 'Fatura Mensal',
  Links: {
    Impressao: 'https://example.test/impressao',
    Certificado: 'https://example.test/certificado.pdf',
  },
};

describe('driver-insurance.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ativa seguro e persiste NumSeguro', async () => {
    mocks.driverFindUnique.mockResolvedValue(driver);
    mocks.insuranceFindUnique.mockResolvedValue(null);

    mocks.insuranceCreate.mockResolvedValue({
      id: 'insurance-1',
      driver_id: driver.id,
      provider: 'PREVILEMOS',
      status: 'PENDING',
      vehicle_plate: 'ABC1D23',
      provider_response: null,
    });

    mocks.createPrevilemosInsurance.mockResolvedValue(
      providerResponse
    );

    mocks.insuranceUpdate.mockResolvedValue({
      id: 'insurance-1',
      status: 'ACTIVE',
      provider_reference: '3482777',
    });

    const result = await activatePrevilemosInsurance(
      driver.id,
      activationInput
    );

    expect(result.idempotent).toBe(false);

    expect(
      mocks.createPrevilemosInsurance
    ).toHaveBeenCalledTimes(1);

    expect(mocks.insuranceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'insurance-1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          provider_reference: '3482777',
        }),
      })
    );
  });

  it('não chama Previlemos novamente quando seguro já está ACTIVE', async () => {
    mocks.driverFindUnique.mockResolvedValue(driver);

    mocks.insuranceFindUnique.mockResolvedValue({
      id: 'insurance-1',
      status: 'ACTIVE',
      provider_reference: '3482777',
    });

    const result = await activatePrevilemosInsurance(
      driver.id,
      activationInput
    );

    expect(result.idempotent).toBe(true);

    expect(
      mocks.createPrevilemosInsurance
    ).not.toHaveBeenCalled();

    expect(mocks.insuranceCreate).not.toHaveBeenCalled();
  });

  it('não permite ativar seguro para motorista não aprovado', async () => {
    mocks.driverFindUnique.mockResolvedValue({
      ...driver,
      status: 'pending',
    });

    await expect(
      activatePrevilemosInsurance(
        driver.id,
        activationInput
      )
    ).rejects.toMatchObject({
      code: 'DRIVER_NOT_APPROVED',
      statusCode: 409,
    });

    expect(
      mocks.createPrevilemosInsurance
    ).not.toHaveBeenCalled();
  });

  it('marca REVIEW quando há falha ambígua 5xx', async () => {
    mocks.driverFindUnique.mockResolvedValue(driver);
    mocks.insuranceFindUnique.mockResolvedValue(null);

    mocks.insuranceCreate.mockResolvedValue({
      id: 'insurance-1',
      status: 'PENDING',
      provider_response: null,
    });

    mocks.createPrevilemosInsurance.mockRejectedValue(
      new PrevilemosError(
        502,
        'Provedor de seguro indisponível no momento.'
      )
    );

    mocks.insuranceUpdate.mockResolvedValue({});

    await expect(
      activatePrevilemosInsurance(
        driver.id,
        activationInput
      )
    ).rejects.toBeInstanceOf(PrevilemosError);

    expect(mocks.insuranceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'insurance-1' },
        data: expect.objectContaining({
          status: 'REVIEW',
          last_error_code: '502',
        }),
      })
    );
  });

  it('cancela seguro ativo mantendo o mesmo NumSeguro', async () => {
    mocks.insuranceFindFirst.mockResolvedValueOnce({
      id: 'insurance-1',
      driver_id: driver.id,
      provider: 'PREVILEMOS',
      status: 'ACTIVE',
      provider_reference: '3482777',
      provider_response: {
        activation: providerResponse,
      },
      request_payload: {
        Tabela: '63C 1',
        ImportanciaSegurada: 30000,
        DataInicial: '2026-09-21',
        DataFinal: '2026-10-21',
        NumPassageiro: 5,
        Segurado: {
          Nome: driver.name,
          CpfCnpj: driver.document_cpf,
          Email: driver.email,
          Celular: driver.phone,
          DataNascimento: '1990-01-10',
        },
        Endereco: activationInput.endereco,
        Veiculo: {
          Tipo: 16,
          Placa: driver.vehicle_plate,
          Marca: 'FIAT',
          Modelo: driver.vehicle_model,
          AnoFabricacao: 2024,
          AnoModelo: 2025,
        },
      },
    });

    mocks.insuranceUpdateMany.mockResolvedValue({
      count: 1,
    });

    mocks.insuranceFindFirst.mockResolvedValueOnce({
      id: 'insurance-1',
      driver_id: driver.id,
      provider: 'PREVILEMOS',
      status: 'CANCELLING',
      provider_reference: '3482777',
      provider_response: {
        activation: providerResponse,
      },
      request_payload: {
        Tabela: '63C 1',
        ImportanciaSegurada: 30000,
        DataInicial: '2026-09-21',
        DataFinal: '2026-10-21',
        NumPassageiro: 5,
        Segurado: {
          Nome: driver.name,
          CpfCnpj: driver.document_cpf,
          Email: driver.email,
          Celular: driver.phone,
          DataNascimento: '1990-01-10',
        },
        Endereco: activationInput.endereco,
        Veiculo: {
          Tipo: 16,
          Placa: driver.vehicle_plate,
          Marca: 'FIAT',
          Modelo: driver.vehicle_model,
          AnoFabricacao: 2024,
          AnoModelo: 2025,
        },
      },
    });

    mocks.createPrevilemosInsurance.mockResolvedValue({
      ...providerResponse,
      DataFinal: '2026-09-22T00:00:00',
    });

    mocks.insuranceUpdate.mockResolvedValue({
      id: 'insurance-1',
      status: 'CANCELLED',
      provider_reference: '3482777',
    });

    const result = await cancelPrevilemosInsurance(
      driver.id,
      'insurance-1',
      '2026-09-22'
    );

    expect(result.idempotent).toBe(false);

    expect(mocks.insuranceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'insurance-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          provider_reference: '3482777',
        }),
      })
    );
  });

  it('cancelamento repetido é idempotente', async () => {
    mocks.insuranceFindFirst.mockResolvedValue({
      id: 'insurance-1',
      status: 'CANCELLED',
      provider_reference: '3482777',
    });

    const result = await cancelPrevilemosInsurance(
      driver.id,
      'insurance-1',
      '2026-09-22'
    );

    expect(result.idempotent).toBe(true);

    expect(
      mocks.createPrevilemosInsurance
    ).not.toHaveBeenCalled();
  });

  it('não chama Previlemos se outro processo adquiriu retry FAILED', async () => {
    mocks.driverFindUnique.mockResolvedValue(driver);

    mocks.insuranceFindUnique
      .mockResolvedValueOnce({
        id: 'insurance-1',
        status: 'FAILED',
      })
      .mockResolvedValueOnce({
        id: 'insurance-1',
        status: 'PENDING',
      });

    mocks.insuranceUpdateMany.mockResolvedValue({
      count: 0,
    });

    const result = await activatePrevilemosInsurance(
      driver.id,
      activationInput
    );

    expect(result.idempotent).toBe(true);
    expect(result.enrollment.status).toBe('PENDING');
    expect(
      mocks.createPrevilemosInsurance
    ).not.toHaveBeenCalled();
  });

  it('não adquire cancelamento quando a data civil é inválida', async () => {
    mocks.insuranceFindFirst.mockResolvedValueOnce({
      id: 'insurance-1',
      driver_id: driver.id,
      provider: 'PREVILEMOS',
      status: 'ACTIVE',
      provider_reference: '3482777',
    });

    await expect(
      cancelPrevilemosInsurance(
        driver.id,
        'insurance-1',
        '2026-02-31'
      )
    ).rejects.toMatchObject({
      code: 'INVALID_DATE',
      statusCode: 400,
    });

    expect(
      mocks.insuranceUpdateMany
    ).not.toHaveBeenCalled();

    expect(
      mocks.createPrevilemosInsurance
    ).not.toHaveBeenCalled();
  });

  it('impede dois cancelamentos concorrentes', async () => {
    mocks.insuranceFindFirst
      .mockResolvedValueOnce({
        id: 'insurance-1',
        driver_id: driver.id,
        provider: 'PREVILEMOS',
        status: 'ACTIVE',
        provider_reference: '3482777',
      })
      .mockResolvedValueOnce({
        id: 'insurance-1',
        driver_id: driver.id,
        provider: 'PREVILEMOS',
        status: 'CANCELLING',
        provider_reference: '3482777',
      });

    mocks.insuranceUpdateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      cancelPrevilemosInsurance(
        driver.id,
        'insurance-1',
        '2026-09-22'
      )
    ).rejects.toMatchObject({
      code: 'INSURANCE_CANCELLATION_IN_PROGRESS',
      statusCode: 409,
    });

    expect(
      mocks.createPrevilemosInsurance
    ).not.toHaveBeenCalled();
  });

  it('não aceita cancelamento de seguro inexistente', async () => {
    mocks.insuranceFindFirst.mockResolvedValue(null);

    await expect(
      cancelPrevilemosInsurance(
        driver.id,
        'missing',
        '2026-09-22'
      )
    ).rejects.toBeInstanceOf(DriverInsuranceError);

    expect(
      mocks.createPrevilemosInsurance
    ).not.toHaveBeenCalled();
  });
});
