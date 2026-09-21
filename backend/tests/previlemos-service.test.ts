import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const validInput = {
  DataInicial: '2026-09-21',
  DataFinal: '2026-10-21',
  NumPassageiro: 5,
  Segurado: {
    Nome: 'Motorista Teste',
    CpfCnpj: '000.000.000-00',
    Email: 'teste@kaviar.com.br',
    Celular: '(21) 90000-0000',
    DataNascimento: '1990-01-01',
  },
  Endereco: {
    Logradouro: 'Rua Teste',
    Numero: '100',
    Complemento: '',
    Bairro: 'Centro',
    Cidade: 'Rio de Janeiro',
    Uf: 'RJ',
    Cep: '20000-000',
  },
  Veiculo: {
    Placa: 'AAA-0000',
    Marca: 'FIAT',
    Modelo: 'ARGO',
    AnoFabricacao: 2024,
    AnoModelo: 2025,
    Chassi: 'TESTECHASSI123456',
    Renavam: '00000000000',
    Proprietario: 'Motorista Teste',
    CpfCnpjProprietario: '000.000.000-00',
  },
};

function jsonResponse(
  status: number,
  data: unknown
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => 'application/json',
    },
    json: async () => data,
    text: async () => '',
  };
}

describe('previlemos-service', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();

    process.env.PREVILEMOS_BASE_URL =
      'https://hml.previlemos.example';
    process.env.PREVILEMOS_USERNAME =
      'kaviar-hml@example.com';
    process.env.PREVILEMOS_PASSWORD =
      'secret-test-only';

    process.env.PREVILEMOS_TABLE = '63C 1';
    process.env.PREVILEMOS_INSURED_AMOUNT = '30000';
    process.env.PREVILEMOS_VEHICLE_TYPE = '16';
    process.env.PREVILEMOS_ENABLED = 'true';
  });

  it('gera token via form-urlencoded sem expor credenciais em URL', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'token_123',
        token_type: 'bearer',
        expires_in: 86400,
      })
    );

    const {
      getPrevilemosAccessToken,
    } = await import('../src/services/previlemos-service');

    const token = await getPrevilemosAccessToken();

    expect(token).toBe('token_123');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] =
      fetchMock.mock.calls[0];

    expect(url).toBe(
      'https://hml.previlemos.example/token'
    );
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );

    const params = new URLSearchParams(
      options.body as string
    );

    expect(params.get('grant_type')).toBe(
      'password'
    );
    expect(params.get('username')).toBe(
      'kaviar-hml@example.com'
    );
    expect(params.get('password')).toBe(
      'secret-test-only'
    );

    expect(String(url)).not.toContain(
      'secret-test-only'
    );
  });

  it('reutiliza token em cache', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: 'cached_token',
        expires_in: 86400,
      })
    );

    const {
      getPrevilemosAccessToken,
    } = await import('../src/services/previlemos-service');

    const first =
      await getPrevilemosAccessToken();

    const second =
      await getPrevilemosAccessToken();

    expect(first).toBe('cached_token');
    expect(second).toBe('cached_token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('monta payload com valores fixos acordados', async () => {
    const {
      buildPrevilemosInsurancePayload,
    } = await import('../src/services/previlemos-service');

    const payload =
      buildPrevilemosInsurancePayload(
        validInput
      );

    expect(payload.Tabela).toBe('63C 1');
    expect(payload.ImportanciaSegurada).toBe(
      30000
    );
    expect(payload.Veiculo.Tipo).toBe(16);
    expect(payload.NumPassageiro).toBe(5);
    expect(payload.Veiculo.Placa).toBe(
      'AAA-0000'
    );
  });

  it('cadastra seguro usando Bearer token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'insurance_token',
          expires_in: 86400,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          NumSeguro: 3482777,
          TipoSeguro: 'APP - Acidente Pessoal de Passageiro',
          DataInicial: '2026-09-21T00:00:00',
          DataFinal: '2026-10-21T00:00:00',
          Produtor: 'KAVIAR TECNOLOGIA - HML',
          Segurado: 'MOTORISTA TESTE',
          Pago: 'Fatura Mensal',
          Links: {
            Impressao: 'https://example.test/impressao',
            Certificado: 'https://example.test/certificado.pdf'
          }
        })
      );

    const {
      createPrevilemosInsurance,
    } = await import('../src/services/previlemos-service');

    const response =
      await createPrevilemosInsurance(
        validInput
      );

    expect(response).toMatchObject({
      NumSeguro: 3482777,
      TipoSeguro: 'APP - Acidente Pessoal de Passageiro',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, options] =
      fetchMock.mock.calls[1];

    expect(url).toBe(
      'https://hml.previlemos.example/api/seguros/faturamento'
    );

    expect(options.method).toBe('POST');

    expect(options.headers.Authorization).toBe(
      'Bearer insurance_token'
    );

    const body = JSON.parse(
      options.body as string
    );

    expect(body.Tabela).toBe('63C 1');
    expect(body.ImportanciaSegurada).toBe(
      30000
    );
    expect(body.Veiculo.Tipo).toBe(16);
  });

  it('renova token e tenta uma vez novamente após 401', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'old_token',
          expires_in: 86400,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          message: 'unauthorized',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'new_token',
          expires_in: 86400,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          NumSeguro: 3482778,
          TipoSeguro: 'APP - Acidente Pessoal de Passageiro',
          DataInicial: '2026-09-21T00:00:00',
          DataFinal: '2026-10-21T00:00:00',
          Produtor: 'KAVIAR TECNOLOGIA - HML',
          Segurado: 'MOTORISTA TESTE',
          Pago: 'Fatura Mensal'
        })
      );

    const {
      createPrevilemosInsurance,
    } = await import('../src/services/previlemos-service');

    const response =
      await createPrevilemosInsurance(
        validInput
      );

    expect(response).toMatchObject({
      NumSeguro: 3482778,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(
      fetchMock.mock.calls[1][1].headers
        .Authorization
    ).toBe('Bearer old_token');

    expect(
      fetchMock.mock.calls[3][1].headers
        .Authorization
    ).toBe('Bearer new_token');
  });

  it('rejeita data civil inexistente', async () => {
    const {
      buildPrevilemosInsurancePayload,
    } = await import('../src/services/previlemos-service');

    expect(() =>
      buildPrevilemosInsurancePayload({
        ...validInput,
        DataInicial: '2026-02-31',
      })
    ).toThrow('Data inicial do seguro inválida.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita cancelamento fora da vigência', async () => {
    const {
      buildPrevilemosInsurancePayload,
    } = await import('../src/services/previlemos-service');

    expect(() =>
      buildPrevilemosInsurancePayload({
        ...validInput,
        DataCancelamento: '2026-11-01',
      })
    ).toThrow(
      'Data de cancelamento deve estar entre a data inicial e a data final.'
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não chama o provedor quando credenciais estão ausentes', async () => {
    process.env.PREVILEMOS_PASSWORD = '';

    const {
      createPrevilemosInsurance,
    } = await import('../src/services/previlemos-service');

    await expect(
      createPrevilemosInsurance(validInput)
    ).rejects.toMatchObject({
      statusCode: 500,
      safeMessage:
        'Credenciais do provedor de seguro não configuradas.',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isPrevilemosEnabled respeita feature flag', async () => {
    const {
      isPrevilemosEnabled,
    } = await import('../src/services/previlemos-service');

    process.env.PREVILEMOS_ENABLED = 'false';
    expect(isPrevilemosEnabled()).toBe(false);

    process.env.PREVILEMOS_ENABLED = 'true';
    expect(isPrevilemosEnabled()).toBe(true);
  });
});

describe('previlemos-service safety flag', () => {
  it('não permite chamada externa quando PREVILEMOS_ENABLED=false', async () => {
    vi.resetModules();
    fetchMock.mockReset();

    process.env.PREVILEMOS_ENABLED = 'false';
    process.env.PREVILEMOS_BASE_URL =
      'https://hml.previlemos.example';
    process.env.PREVILEMOS_USERNAME =
      'kaviar-hml@example.com';
    process.env.PREVILEMOS_PASSWORD =
      'secret-test-only';

    const {
      createPrevilemosInsurance,
    } = await import('../src/services/previlemos-service');

    await expect(
      createPrevilemosInsurance(validInput)
    ).rejects.toMatchObject({
      statusCode: 503,
      safeMessage:
        'Integração de seguro desabilitada.',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
