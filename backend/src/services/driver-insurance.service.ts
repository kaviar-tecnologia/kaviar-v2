import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  buildPrevilemosInsurancePayload,
  createPrevilemosInsurance,
  PrevilemosError,
  PrevilemosInsuranceInput,
  PrevilemosInsuranceResponse,
} from './previlemos-service';

const PROVIDER = 'PREVILEMOS';

export class DriverInsuranceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DriverInsuranceError';
  }
}

export interface ActivatePrevilemosDriverInsuranceInput {
  dataInicial: string;
  dataFinal: string;
  numPassageiro?: number;

  dataNascimento: string;

  endereco: {
    Logradouro: string;
    Numero: string;
    Complemento?: string;
    Bairro: string;
    Cidade: string;
    Uf: string;
    Cep: string;
  };

  veiculo: {
    Marca: string;
    Modelo?: string;
    AnoFabricacao: number;
    AnoModelo: number;
    Chassi?: string;
    Renavam?: string;
    Proprietario?: string;
    CpfCnpjProprietario?: string;
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function civilDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new DriverInsuranceError(
      400,
      'INVALID_DATE',
      'A data deve estar no formato YYYY-MM-DD.'
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new DriverInsuranceError(
      400,
      'INVALID_DATE',
      'Data inválida.'
    );
  }

  return date;
}

function extractNumSeguro(
  response: PrevilemosInsuranceResponse
): string {
  const value = Number(response.NumSeguro);

  if (!Number.isFinite(value) || value <= 0) {
    throw new DriverInsuranceError(
      502,
      'INVALID_PROVIDER_RESPONSE',
      'A Previlemos não retornou um número de seguro válido.'
    );
  }

  return String(value);
}

function storedResponses(
  previous: unknown,
  key: 'activation' | 'cancellation',
  response: PrevilemosInsuranceResponse
): Prisma.InputJsonValue {
  const existing =
    previous &&
    typeof previous === 'object' &&
    !Array.isArray(previous)
      ? previous
      : {};

  return toJson({
    ...existing,
    [key]: response,
  });
}

export async function activatePrevilemosInsurance(
  driverId: string,
  input: ActivatePrevilemosDriverInsuranceInput
) {
  const driver = await prisma.drivers.findUnique({
    where: { id: driverId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      document_cpf: true,
      vehicle_plate: true,
      vehicle_model: true,
      vehicle_type: true,
    },
  });

  if (!driver) {
    throw new DriverInsuranceError(
      404,
      'DRIVER_NOT_FOUND',
      'Motorista não encontrado.'
    );
  }

  if (driver.status !== 'approved') {
    throw new DriverInsuranceError(
      409,
      'DRIVER_NOT_APPROVED',
      'O seguro só pode ser ativado para motorista aprovado.'
    );
  }

  if (driver.vehicle_type === 'MOTORCYCLE') {
    throw new DriverInsuranceError(
      409,
      'UNSUPPORTED_VEHICLE_TYPE',
      'A integração Previlemos está habilitada somente para carros nesta fase.'
    );
  }

  if (
    !driver.document_cpf ||
    !driver.vehicle_plate ||
    !driver.vehicle_model
  ) {
    throw new DriverInsuranceError(
      409,
      'DRIVER_DATA_INCOMPLETE',
      'CPF, placa e modelo do veículo são obrigatórios.'
    );
  }

  const validFrom = civilDate(input.dataInicial);
  const validUntil = civilDate(input.dataFinal);
  civilDate(input.dataNascimento);

  if (validFrom.getTime() > validUntil.getTime()) {
    throw new DriverInsuranceError(
      400,
      'INVALID_PERIOD',
      'Data inicial não pode ser posterior à data final.'
    );
  }

  const plate = driver.vehicle_plate.trim().toUpperCase();

  const providerInput: PrevilemosInsuranceInput = {
    DataInicial: input.dataInicial,
    DataFinal: input.dataFinal,
    NumPassageiro: input.numPassageiro ?? 5,

    Segurado: {
      Nome: driver.name,
      CpfCnpj: driver.document_cpf,
      Email: driver.email,
      Celular: driver.phone || undefined,
      DataNascimento: input.dataNascimento,
    },

    Endereco: {
      Logradouro: input.endereco.Logradouro,
      Numero: input.endereco.Numero,
      Complemento: input.endereco.Complemento,
      Bairro: input.endereco.Bairro,
      Cidade: input.endereco.Cidade,
      Uf: input.endereco.Uf,
      Cep: input.endereco.Cep,
    },

    Veiculo: {
      Placa: plate,
      Marca: input.veiculo.Marca,
      Modelo: input.veiculo.Modelo || driver.vehicle_model,
      AnoFabricacao: input.veiculo.AnoFabricacao,
      AnoModelo: input.veiculo.AnoModelo,
      Chassi: input.veiculo.Chassi,
      Renavam: input.veiculo.Renavam,
      Proprietario: input.veiculo.Proprietario || driver.name,
      CpfCnpjProprietario:
        input.veiculo.CpfCnpjProprietario || driver.document_cpf,
    },
  };

  const payload = buildPrevilemosInsurancePayload(providerInput);

  const uniqueWhere = {
    driver_provider_plate_valid_from: {
      driver_id: driver.id,
      provider: PROVIDER,
      vehicle_plate: plate,
      valid_from: validFrom,
    },
  };

  let existing =
    await prisma.driver_insurance_enrollments.findUnique({
      where: uniqueWhere,
    });

  /*
   * Repetir exatamente a mesma chave de emissão continua idempotente.
   * FAILED pode ser retomado; outros estados retornam o registro atual
   * sem nova chamada externa.
   */
  if (existing && existing.status !== 'FAILED') {
    return {
      enrollment: existing,
      idempotent: true,
    };
  }

  /*
   * Defesa adicional contra dupla cobertura acidental:
   * uma nova vigência não pode se sobrepor a outro registro ainda
   * ativo ou cujo resultado/cancelamento esteja pendente de confirmação.
   *
   * Um FAILED com a mesma chave fica fora desta consulta para permitir retry.
   * Períodos futuros sem sobreposição continuam permitidos.
   */
  const overlapping =
    await prisma.driver_insurance_enrollments.findFirst({
      where: {
        driver_id: driver.id,
        provider: PROVIDER,
        vehicle_plate: plate,
        ...(existing ? { id: { not: existing.id } } : {}),
        status: {
          in: [
            'PENDING',
            'ACTIVE',
            'REVIEW',
            'CANCELLING',
            'CANCELLATION_REVIEW',
          ],
        },
        valid_from: { lte: validUntil },
        valid_until: { gte: validFrom },
      },
      select: {
        id: true,
        status: true,
        valid_from: true,
        valid_until: true,
      },
    });

  if (overlapping) {
    throw new DriverInsuranceError(
      409,
      'INSURANCE_PERIOD_CONFLICT',
      'Já existe seguro ou operação Previlemos com vigência sobreposta para este veículo.'
    );
  }

  let enrollment = existing;

  if (existing) {
    const claimed =
      await prisma.driver_insurance_enrollments.updateMany({
        where: {
          id: existing.id,
          status: 'FAILED',
        },
        data: {
          status: 'PENDING',
          valid_until: validUntil,
          cancelled_at: null,
          request_payload: toJson(payload),
          last_error_code: null,
          last_error_message: null,
          attempt_count: { increment: 1 },
          last_attempt_at: new Date(),
        },
      });

    if (claimed.count !== 1) {
      const current =
        await prisma.driver_insurance_enrollments.findUnique({
          where: uniqueWhere,
        });

      if (current) {
        return {
          enrollment: current,
          idempotent: true,
        };
      }

      throw new DriverInsuranceError(
        409,
        'INSURANCE_CONCURRENT_UPDATE',
        'O seguro está sendo processado por outra requisição.'
      );
    }

    enrollment =
      await prisma.driver_insurance_enrollments.findUnique({
        where: uniqueWhere,
      });
  } else {
    try {
      enrollment =
        await prisma.driver_insurance_enrollments.create({
          data: {
            driver_id: driver.id,
            provider: PROVIDER,
            status: 'PENDING',
            vehicle_plate: plate,
            valid_from: validFrom,
            valid_until: validUntil,
            request_payload: toJson(payload),
            attempt_count: 1,
            last_attempt_at: new Date(),
          },
        });
    } catch (error) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? String(
              (error as { code?: unknown }).code ?? ''
            )
          : '';

      if (code === 'P2002') {
        const current =
          await prisma.driver_insurance_enrollments.findUnique({
            where: uniqueWhere,
          });

        if (current) {
          return {
            enrollment: current,
            idempotent: true,
          };
        }
      }

      throw error;
    }
  }

  if (!enrollment) {
    throw new DriverInsuranceError(
      409,
      'INSURANCE_CONCURRENT_UPDATE',
      'Não foi possível adquirir o processamento do seguro.'
    );
  }

  try {
    const response =
      await createPrevilemosInsurance(providerInput);

    const numSeguro = extractNumSeguro(response);

    const saved =
      await prisma.driver_insurance_enrollments.update({
        where: { id: enrollment.id },
        data: {
          status: 'ACTIVE',
          provider_reference: numSeguro,
          provider_response: storedResponses(
            enrollment.provider_response,
            'activation',
            response
          ),
          last_error_code: null,
          last_error_message: null,
        },
      });

    return {
      enrollment: saved,
      idempotent: false,
    };
  } catch (error) {
    const ambiguous =
      !(error instanceof PrevilemosError) ||
      error.statusCode >= 500;

    const status = ambiguous ? 'REVIEW' : 'FAILED';

    const errorCode =
      error instanceof PrevilemosError
        ? String(error.statusCode)
        : 'NETWORK_OR_UNKNOWN';

    const message =
      error instanceof PrevilemosError
        ? error.safeMessage
        : 'Falha de comunicação com a Previlemos; verificar antes de reenviar.';

    await prisma.driver_insurance_enrollments.update({
      where: { id: enrollment.id },
      data: {
        status,
        last_error_code: errorCode,
        last_error_message: message,
      },
    });

    throw error;
  }
}

export async function listPrevilemosInsurance(
  driverId: string
) {
  return prisma.driver_insurance_enrollments.findMany({
    where: {
      driver_id: driverId,
      provider: PROVIDER,
    },
    orderBy: {
      created_at: 'desc',
    },
    select: {
      id: true,
      provider: true,
      status: true,
      vehicle_plate: true,
      valid_from: true,
      valid_until: true,
      cancelled_at: true,
      provider_reference: true,
      provider_response: true,
      last_error_code: true,
      last_error_message: true,
      attempt_count: true,
      last_attempt_at: true,
      created_at: true,
      updated_at: true,
    },
  });
}

export async function cancelPrevilemosInsurance(
  driverId: string,
  insuranceId: string,
  dataCancelamento: string
) {
  let enrollment =
    await prisma.driver_insurance_enrollments.findFirst({
      where: {
        id: insuranceId,
        driver_id: driverId,
        provider: PROVIDER,
      },
    });

  if (!enrollment) {
    throw new DriverInsuranceError(
      404,
      'INSURANCE_NOT_FOUND',
      'Seguro não encontrado.'
    );
  }

  if (enrollment.status === 'CANCELLED') {
    return {
      enrollment,
      idempotent: true,
    };
  }

  if (enrollment.status !== 'ACTIVE') {
    throw new DriverInsuranceError(
      409,
      'INSURANCE_NOT_ACTIVE',
      'Somente seguro ativo pode ser cancelado.'
    );
  }

  const cancellationDate = civilDate(dataCancelamento);

  const claimed =
    await prisma.driver_insurance_enrollments.updateMany({
      where: {
        id: enrollment.id,
        driver_id: driverId,
        provider: PROVIDER,
        status: 'ACTIVE',
      },
      data: {
        status: 'CANCELLING',
        last_error_code: null,
        last_error_message: null,
      },
    });

  if (claimed.count !== 1) {
    const current =
      await prisma.driver_insurance_enrollments.findFirst({
        where: {
          id: insuranceId,
          driver_id: driverId,
          provider: PROVIDER,
        },
      });

    if (current?.status === 'CANCELLED') {
      return {
        enrollment: current,
        idempotent: true,
      };
    }

    throw new DriverInsuranceError(
      409,
      'INSURANCE_CANCELLATION_IN_PROGRESS',
      'O cancelamento já está sendo processado ou requer revisão.'
    );
  }

  enrollment =
    await prisma.driver_insurance_enrollments.findFirst({
      where: {
        id: insuranceId,
        driver_id: driverId,
        provider: PROVIDER,
      },
    });

  if (!enrollment) {
    throw new DriverInsuranceError(
      409,
      'INSURANCE_CONCURRENT_UPDATE',
      'Não foi possível recuperar o seguro após adquirir o cancelamento.'
    );
  }

  const payload =
    enrollment.request_payload as unknown as
      ReturnType<typeof buildPrevilemosInsurancePayload>;

  const providerInput: PrevilemosInsuranceInput = {
    DataInicial: payload.DataInicial,
    DataFinal: payload.DataFinal,
    DataCancelamento: dataCancelamento,
    NumPassageiro: payload.NumPassageiro,
    Segurado: payload.Segurado,
    Endereco: payload.Endereco,
    Veiculo: {
      Placa: payload.Veiculo.Placa,
      Marca: payload.Veiculo.Marca,
      Modelo: payload.Veiculo.Modelo,
      AnoFabricacao: payload.Veiculo.AnoFabricacao,
      AnoModelo: payload.Veiculo.AnoModelo,
      Chassi: payload.Veiculo.Chassi,
      Renavam: payload.Veiculo.Renavam,
      Proprietario: payload.Veiculo.Proprietario,
      CpfCnpjProprietario:
        payload.Veiculo.CpfCnpjProprietario,
    },
  };

  try {
    const response =
      await createPrevilemosInsurance(providerInput);

    const returnedNumSeguro = extractNumSeguro(response);

    if (
      enrollment.provider_reference &&
      returnedNumSeguro !== enrollment.provider_reference
    ) {
      throw new DriverInsuranceError(
        502,
        'PROVIDER_REFERENCE_MISMATCH',
        'A Previlemos retornou número de seguro diferente durante o cancelamento.'
      );
    }

    const saved =
      await prisma.driver_insurance_enrollments.update({
        where: { id: enrollment.id },
        data: {
          status: 'CANCELLED',
          cancelled_at: cancellationDate,
          provider_reference: returnedNumSeguro,
          provider_response: storedResponses(
            enrollment.provider_response,
            'cancellation',
            response
          ),
          request_payload: toJson(
            buildPrevilemosInsurancePayload(providerInput)
          ),
          last_error_code: null,
          last_error_message: null,
        },
      });

    return {
      enrollment: saved,
      idempotent: false,
    };
  } catch (error) {
    /*
     * Não marcamos como CANCELLED em caso de timeout/5xx.
     * Como a Previlemos pode ter processado antes da conexão cair,
     * essa situação exige conferência e não deve ser repetida às cegas.
     */
    const ambiguous =
      !(error instanceof PrevilemosError) ||
      error.statusCode >= 500;

    await prisma.driver_insurance_enrollments.update({
      where: { id: enrollment.id },
      data: {
        status: ambiguous
          ? 'CANCELLATION_REVIEW'
          : 'ACTIVE',
        last_error_code:
          error instanceof PrevilemosError
            ? String(error.statusCode)
            : 'NETWORK_OR_UNKNOWN',
        last_error_message:
          error instanceof PrevilemosError
            ? error.safeMessage
            : 'Falha de comunicação durante cancelamento; verificar antes de reenviar.',
        attempt_count: { increment: 1 },
        last_attempt_at: new Date(),
      },
    });

    throw error;
  }
}
