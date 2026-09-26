const SUMUP_BASE_URL = process.env.SUMUP_BASE_URL || 'https://api.sumup.com';
const SUMUP_API_KEY = process.env.SUMUP_API_KEY || '';
const SUMUP_MERCHANT_CODE = process.env.SUMUP_MERCHANT_CODE || '';

export class SumUpError extends Error {
  readonly statusCode: number;
  readonly safeMessage: string;
  readonly method?: 'GET' | 'POST' | 'PUT';
  readonly endpoint?: string;
  readonly responseKeys?: string[];

  constructor(
    statusCode: number,
    safeMessage: string,
    context?: {
      method?: 'GET' | 'POST' | 'PUT';
      endpoint?: string;
      responseKeys?: string[];
    }
  ) {
    super(safeMessage);
    this.name = 'SumUpError';
    this.statusCode = statusCode;
    this.safeMessage = safeMessage;
    this.method = context?.method;
    this.endpoint = context?.endpoint;
    this.responseKeys = context?.responseKeys;
  }
}

export interface SumUpCheckoutCreateRequest {
  checkout_reference: string;
  amount: number;
  currency: 'BRL' | string;
  description: string;
  merchant_code?: string;
  return_url?: string;
  hosted_checkout?: {
    enabled: boolean;
  };
}

export interface SumUpCheckoutProcessRequest {
  payment_type: 'card' | 'pix' | 'qr_code_pix' | string;
  [key: string]: unknown;
}

export interface SumUpCheckoutCreateResponse {
  id: string;
  checkout_reference?: string;
  amount?: number;
  currency?: string;
  date?: string;
  description?: string;
  merchant_code?: string;
  status?: string;
  transaction_id?: string;
  checkout_url?: string;
  hosted_checkout_url?: string;
  [key: string]: unknown;
}

export interface SumUpCheckoutPaymentMethod {
  id?: string;
  name?: string;
  type?: string;
  code?: string;
  method?: string;
  [key: string]: unknown;
}

export interface SumUpMerchantPaymentMethod {
  id?: string;
  type?: string;
  code?: string;
  method?: string;
  [key: string]: unknown;
}

function mapStatusToSafeMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Dados inválidos para criar checkout SumUp.';
    case 401:
      return 'Falha de autenticação no provedor de pagamento.';
    case 402:
      return 'Pagamento recusado pelo provedor.';
    case 403:
      return 'Acesso negado ao provedor de pagamento.';
    case 404:
      return 'Recurso de pagamento não encontrado.';
    case 409:
      return 'Conflito ao criar checkout no provedor.';
    case 422:
      return 'Checkout não pôde ser processado pelo provedor.';
    case 429:
      return 'Limite de requisições do provedor excedido.';
    default:
      if (status >= 500) return 'Provedor de pagamento indisponível no momento.';
      return 'Falha ao criar checkout no provedor de pagamento.';
  }
}

async function sumupRequest<T>(path: string, method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> {
  if (!SUMUP_API_KEY) {
    throw new SumUpError(500, 'Configuração de pagamento indisponível.');
  }

  const res = await fetch(`${SUMUP_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUMUP_API_KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const raw = await res.text();
    data = raw ? { message: raw.slice(0, 200) } : {};
  }

  if (!res.ok) {
    const safeMessage = mapStatusToSafeMessage(res.status);
    const responseKeys = data && typeof data === 'object' ? Object.keys(data).slice(0, 20) : [];
    // Não registrar payload sensível nem token da requisição
    console.error(
      `[SUMUP_HTTP_ERROR] method=${method} endpoint=${path} status=${res.status} response_keys=${responseKeys.join(',') || 'none'}`
    );
    throw new SumUpError(res.status, safeMessage, {
      method,
      endpoint: path,
      responseKeys,
    });
  }

  return data as T;
}

/** Backend notification endpoint, NOT a browser redirect or a shared-secret URL.
 * SumUp POSTs the checkout id; the receiver must independently query the SumUp API.
 * Never include credentials in a callback URL. Disabled until explicitly configured.
 */
export function getSumUpCheckoutCallbackUrl(): string | undefined {
  const raw = process.env.SUMUP_CHECKOUT_CALLBACK_URL?.trim();
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password ||
        parsed.search || parsed.hash) {
      throw new Error('Unsafe callback URL');
    }
    return parsed.toString();
  } catch {
    throw new SumUpError(500, 'Configuração de callback SumUp inválida.');
  }
}

export async function createSumUpCheckout(input: SumUpCheckoutCreateRequest): Promise<SumUpCheckoutCreateResponse> {
  const merchantCode = input.merchant_code || SUMUP_MERCHANT_CODE;
  if (!merchantCode) {
    throw new SumUpError(500, 'Configuração de merchant SumUp indisponível.');
  }

  const payload = {
    checkout_reference: input.checkout_reference,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    merchant_code: merchantCode,
    ...(input.return_url ? { return_url: input.return_url } : {}),
    hosted_checkout: { enabled: input.hosted_checkout?.enabled ?? true },
  };

  const checkout = await sumupRequest<SumUpCheckoutCreateResponse>('/v0.1/checkouts', 'POST', payload);
  if (!checkout?.id) {
    throw new SumUpError(502, 'Resposta inválida do provedor de pagamento.');
  }
  return checkout;
}

export async function getSumUpCheckout(checkoutId: string): Promise<SumUpCheckoutCreateResponse> {
  if (!checkoutId) {
    throw new SumUpError(400, 'Checkout inválido para consulta.');
  }
  const checkout = await sumupRequest<SumUpCheckoutCreateResponse>(`/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, 'GET');
  if (!checkout?.id) {
    throw new SumUpError(502, 'Resposta inválida do provedor de pagamento.');
  }
  return checkout;
}

export async function processSumUpCheckout(checkoutId: string, input: SumUpCheckoutProcessRequest): Promise<SumUpCheckoutCreateResponse> {
  if (!checkoutId) {
    throw new SumUpError(400, 'Checkout inválido para processamento.');
  }
  if (!input?.payment_type) {
    throw new SumUpError(400, 'payment_type obrigatório para processamento.');
  }

  const checkout = await sumupRequest<SumUpCheckoutCreateResponse>(
    `/v0.1/checkouts/${encodeURIComponent(checkoutId)}`,
    'PUT',
    input
  );
  if (!checkout?.id) {
    throw new SumUpError(502, 'Resposta inválida do provedor de pagamento.');
  }
  return checkout;
}

export async function getSumUpCheckoutPaymentMethods(checkoutId: string): Promise<SumUpCheckoutPaymentMethod[]> {
  if (!checkoutId) {
    throw new SumUpError(400, 'Checkout inválido para consulta de métodos.');
  }

  const response = await sumupRequest<
    SumUpCheckoutPaymentMethod[] | {
      items?: SumUpCheckoutPaymentMethod[];
      available_payment_methods?: SumUpCheckoutPaymentMethod[];
      payment_methods?: SumUpCheckoutPaymentMethod[];
    }
  >(
    `/v0.1/checkouts/${encodeURIComponent(checkoutId)}/payment-methods`,
    'GET'
  );

  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.available_payment_methods)) return response.available_payment_methods;
  if (Array.isArray(response?.payment_methods)) return response.payment_methods;
  return [];
}

export async function getSumUpMerchantPaymentMethods(merchantCode?: string): Promise<SumUpMerchantPaymentMethod[]> {
  const resolvedMerchantCode = merchantCode || SUMUP_MERCHANT_CODE;
  if (!resolvedMerchantCode) {
    throw new SumUpError(500, 'Configuração de merchant SumUp indisponível.');
  }

  const response = await sumupRequest<
    SumUpMerchantPaymentMethod[] | {
      payment_methods?: SumUpMerchantPaymentMethod[];
      available_payment_methods?: SumUpMerchantPaymentMethod[];
    }
  >(
    `/v0.1/merchants/${encodeURIComponent(resolvedMerchantCode)}/payment-methods`,
    'GET'
  );

  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.available_payment_methods)) return response.available_payment_methods;
  if (Array.isArray(response?.payment_methods)) return response.payment_methods;
  return [];
}

export function hasSumUpPixPaymentMethod(methods: SumUpMerchantPaymentMethod[]): boolean {
  return resolveSumUpPixPaymentType(methods) !== null;
}

export function resolveSumUpPixPaymentType(methods: SumUpMerchantPaymentMethod[]): 'qr_code_pix' | 'pix' | null {
  const tags = methods
    .flatMap((method) => [method.id, method.type, method.code, method.method])
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (tags.some((tag) => tag.includes('qr_code_pix'))) return 'qr_code_pix';
  if (tags.some((tag) => tag === 'pix')) return 'pix';
  return null;
}

export function isSumUpEnabled(): boolean {
  return process.env.SUMUP_ENABLED === 'true';
}
