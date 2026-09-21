const PREVILEMOS_BASE_URL = process.env.PREVILEMOS_BASE_URL || '';
const PREVILEMOS_USERNAME = process.env.PREVILEMOS_USERNAME || '';
const PREVILEMOS_PASSWORD = process.env.PREVILEMOS_PASSWORD || '';

const PREVILEMOS_TABLE = process.env.PREVILEMOS_TABLE || '63C 1';
const PREVILEMOS_INSURED_AMOUNT = Number(
  process.env.PREVILEMOS_INSURED_AMOUNT || '30000'
);
const PREVILEMOS_VEHICLE_TYPE = Number(
  process.env.PREVILEMOS_VEHICLE_TYPE || '16'
);
const PREVILEMOS_HTTP_TIMEOUT_MS = Number(
  process.env.PREVILEMOS_HTTP_TIMEOUT_MS || '10000'
);

const TOKEN_REFRESH_SAFETY_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60;

let tokenCache: {
  accessToken: string;
  expiresAt: number;
} | null = null;

export class PrevilemosError extends Error {
  readonly statusCode: number;
  readonly safeMessage: string;
  readonly endpoint?: string;
  readonly responseKeys?: string[];

  constructor(
    statusCode: number,
    safeMessage: string,
    context?: {
      endpoint?: string;
      responseKeys?: string[];
    }
  ) {
    super(safeMessage);
    this.name = 'PrevilemosError';
    this.statusCode = statusCode;
    this.safeMessage = safeMessage;
    this.endpoint = context?.endpoint;
    this.responseKeys = context?.responseKeys;
  }
}

export interface PrevilemosInsured {
  Nome: string;
  CpfCnpj: string;
  Email?: string;
  Telefone?: string;
  Celular?: string;
  DataNascimento?: string;
}

export interface PrevilemosAddress {
  Logradouro: string;
  Numero: string;
  Complemento?: string;
  Bairro: string;
  Cidade: string;
  Uf: string;
  Cep: string;
}

export interface PrevilemosVehicle {
  Placa: string;
  Marca: string;
  Modelo: string;
  AnoFabricacao: number;
  AnoModelo: number;
  Chassi?: string;
  Renavam?: string;
  Proprietario?: string;
  CpfCnpjProprietario?: string;
}

export interface PrevilemosInsuranceInput {
  DataInicial: string;
  DataFinal: string;
  NumPassageiro: number;
  DataCancelamento?: string;
  Segurado: PrevilemosInsured;
  Endereco: PrevilemosAddress;
  Veiculo: PrevilemosVehicle;
}

export interface PrevilemosInsurancePayload {
  Tabela: string;
  ImportanciaSegurada: number;
  DataInicial: string;
  DataFinal: string;
  NumPassageiro: number;
  DataCancelamento?: string;
  Segurado: PrevilemosInsured;
  Endereco: PrevilemosAddress;
  Veiculo: PrevilemosVehicle & {
    Tipo: number;
  };
}

export interface PrevilemosTokenResponse {
  access_token?: string;
  accessToken?: string;
  token?: string;
  token_type?: string;
  expires_in?: number | string;
  [key: string]: unknown;
}

export interface PrevilemosInsuranceResponse {
  [key: string]: unknown;
}

function assertConfigured(): void {
  if (!isPrevilemosEnabled()) {
    throw new PrevilemosError(
      503,
      'Integração de seguro desabilitada.'
    );
  }

  if (!PREVILEMOS_BASE_URL) {
    throw new PrevilemosError(
      500,
      'Integração de seguro não configurada.'
    );
  }

  if (!PREVILEMOS_USERNAME || !PREVILEMOS_PASSWORD) {
    throw new PrevilemosError(
      500,
      'Credenciais do provedor de seguro não configuradas.'
    );
  }
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function isValidDate(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return !Number.isNaN(new Date(value).getTime());
}

function validateInsuranceInput(input: PrevilemosInsuranceInput): void {
  if (!isValidDate(input.DataInicial)) {
    throw new PrevilemosError(400, 'Data inicial do seguro inválida.');
  }

  if (!isValidDate(input.DataFinal)) {
    throw new PrevilemosError(400, 'Data final do seguro inválida.');
  }

  const initial = new Date(input.DataInicial).getTime();
  const final = new Date(input.DataFinal).getTime();

  if (initial > final) {
    throw new PrevilemosError(
      400,
      'Data inicial do seguro deve ser anterior ou igual à data final.'
    );
  }

  if (input.DataCancelamento) {
    if (!isValidDate(input.DataCancelamento)) {
      throw new PrevilemosError(
        400,
        'Data de cancelamento do seguro inválida.'
      );
    }

    const cancellation = new Date(input.DataCancelamento).getTime();

    if (cancellation < initial || cancellation > final) {
      throw new PrevilemosError(
        400,
        'Data de cancelamento deve estar entre a data inicial e a data final.'
      );
    }
  }

  if (
    !Number.isInteger(input.NumPassageiro) ||
    input.NumPassageiro <= 0
  ) {
    throw new PrevilemosError(
      400,
      'Número de ocupantes do veículo inválido.'
    );
  }

  if (!input.Segurado?.Nome?.trim()) {
    throw new PrevilemosError(400, 'Nome do segurado é obrigatório.');
  }

  if (!input.Segurado?.CpfCnpj?.trim()) {
    throw new PrevilemosError(
      400,
      'CPF/CNPJ do segurado é obrigatório.'
    );
  }

  if (!input.Veiculo?.Placa?.trim()) {
    throw new PrevilemosError(400, 'Placa do veículo é obrigatória.');
  }

  if (!input.Veiculo?.Marca?.trim() || !input.Veiculo?.Modelo?.trim()) {
    throw new PrevilemosError(
      400,
      'Marca e modelo do veículo são obrigatórios.'
    );
  }

  if (
    !Number.isInteger(input.Veiculo.AnoFabricacao) ||
    !Number.isInteger(input.Veiculo.AnoModelo)
  ) {
    throw new PrevilemosError(
      400,
      'Ano de fabricação e ano do modelo são obrigatórios.'
    );
  }

  if (
    !input.Endereco?.Logradouro?.trim() ||
    !input.Endereco?.Numero?.trim() ||
    !input.Endereco?.Bairro?.trim() ||
    !input.Endereco?.Cidade?.trim() ||
    !input.Endereco?.Uf?.trim() ||
    !input.Endereco?.Cep?.trim()
  ) {
    throw new PrevilemosError(
      400,
      'Endereço do segurado está incompleto.'
    );
  }
}

function mapHttpError(status: number): string {
  switch (status) {
    case 400:
      return 'Dados inválidos enviados ao provedor de seguro.';
    case 401:
      return 'Falha de autenticação no provedor de seguro.';
    case 403:
      return 'Acesso negado pelo provedor de seguro.';
    case 404:
      return 'Serviço de seguro não encontrado.';
    case 409:
      return 'Conflito ao cadastrar seguro.';
    case 422:
      return 'Seguro não pôde ser processado pelo provedor.';
    case 429:
      return 'Limite de requisições do provedor de seguro excedido.';
    default:
      if (status >= 500) {
        return 'Provedor de seguro indisponível no momento.';
      }

      return 'Falha na comunicação com o provedor de seguro.';
  }
}

async function parseResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const raw = await response.text();

  return raw
    ? { message: raw.slice(0, 200) }
    : {};
}

function responseKeys(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }

  return Object.keys(data).slice(0, 20);
}

function extractAccessToken(data: PrevilemosTokenResponse): string | null {
  const candidate =
    data.access_token ||
    data.accessToken ||
    data.token;

  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : null;
}

function resolveTokenTtlSeconds(data: PrevilemosTokenResponse): number {
  const parsed = Number(data.expires_in);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_TOKEN_TTL_SECONDS;
}

async function requestNewToken(): Promise<string> {
  assertConfigured();

  const body = new URLSearchParams({
    grant_type: 'password',
    username: PREVILEMOS_USERNAME,
    password: PREVILEMOS_PASSWORD,
  });

  const response = await fetch(
    `${normalizeBaseUrl(PREVILEMOS_BASE_URL)}/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(PREVILEMOS_HTTP_TIMEOUT_MS),
    }
  );

  const data = await parseResponse(response);

  if (!response.ok) {
    const keys = responseKeys(data);

    console.error(
      `[PREVILEMOS_HTTP_ERROR] endpoint=/token status=${response.status} response_keys=${keys.join(',') || 'none'}`
    );

    throw new PrevilemosError(
      response.status,
      mapHttpError(response.status),
      {
        endpoint: '/token',
        responseKeys: keys,
      }
    );
  }

  const accessToken = extractAccessToken(
    data as PrevilemosTokenResponse
  );

  if (!accessToken) {
    throw new PrevilemosError(
      502,
      'Resposta de autenticação inválida do provedor de seguro.',
      {
        endpoint: '/token',
        responseKeys: responseKeys(data),
      }
    );
  }

  const ttlSeconds = resolveTokenTtlSeconds(
    data as PrevilemosTokenResponse
  );

  tokenCache = {
    accessToken,
    expiresAt:
      Date.now() +
      ttlSeconds * 1000 -
      TOKEN_REFRESH_SAFETY_MS,
  };

  return accessToken;
}

export async function getPrevilemosAccessToken(
  forceRefresh = false
): Promise<string> {
  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.expiresAt > Date.now()
  ) {
    return tokenCache.accessToken;
  }

  tokenCache = null;
  return requestNewToken();
}

export function buildPrevilemosInsurancePayload(
  input: PrevilemosInsuranceInput
): PrevilemosInsurancePayload {
  validateInsuranceInput(input);

  return {
    Tabela: PREVILEMOS_TABLE,
    ImportanciaSegurada: PREVILEMOS_INSURED_AMOUNT,
    DataInicial: input.DataInicial,
    DataFinal: input.DataFinal,
    NumPassageiro: input.NumPassageiro,
    ...(input.DataCancelamento
      ? { DataCancelamento: input.DataCancelamento }
      : {}),
    Segurado: input.Segurado,
    Endereco: input.Endereco,
    Veiculo: {
      Tipo: PREVILEMOS_VEHICLE_TYPE,
      ...input.Veiculo,
    },
  };
}

async function sendInsuranceRequest(
  payload: PrevilemosInsurancePayload,
  accessToken: string
): Promise<Response> {
  return fetch(
    `${normalizeBaseUrl(PREVILEMOS_BASE_URL)}/api/seguros/faturamento`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PREVILEMOS_HTTP_TIMEOUT_MS),
    }
  );
}

export async function createPrevilemosInsurance(
  input: PrevilemosInsuranceInput
): Promise<PrevilemosInsuranceResponse> {
  assertConfigured();

  const payload = buildPrevilemosInsurancePayload(input);

  let accessToken = await getPrevilemosAccessToken();
  let response = await sendInsuranceRequest(
    payload,
    accessToken
  );

  if (response.status === 401) {
    tokenCache = null;
    accessToken = await getPrevilemosAccessToken(true);
    response = await sendInsuranceRequest(
      payload,
      accessToken
    );
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    const keys = responseKeys(data);

    console.error(
      `[PREVILEMOS_HTTP_ERROR] endpoint=/api/seguros/faturamento status=${response.status} response_keys=${keys.join(',') || 'none'}`
    );

    throw new PrevilemosError(
      response.status,
      mapHttpError(response.status),
      {
        endpoint: '/api/seguros/faturamento',
        responseKeys: keys,
      }
    );
  }

  return data as PrevilemosInsuranceResponse;
}

export function isPrevilemosEnabled(): boolean {
  return process.env.PREVILEMOS_ENABLED === 'true';
}

export function clearPrevilemosTokenCacheForTests(): void {
  tokenCache = null;
}
