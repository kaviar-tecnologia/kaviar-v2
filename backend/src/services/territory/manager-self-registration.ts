import { z } from 'zod';

export type ManagerRegistrationProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_cpf: string | null;
  address: string | null;
  document_rg: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
};

export type ManagerDocumentReviewProfile = ManagerRegistrationProfile & {
  recipient_type?: string;
  company_name?: string | null;
  document_cnpj?: string | null;
  legal_representative_name?: string | null;
  legal_representative_cpf?: string | null;
};

export type ManagerRegistrationChanges = {
  document_cpf?: string;
  address?: string;
  document_rg?: string;
  pix_key?: string;
  pix_key_type?: string;
};

const pixTypes = ['cpf', 'cnpj', 'email', 'phone', 'random'] as const;
const registrationSchema = z.object({
  document_cpf: z.string().max(20).optional(),
  address: z.string().trim().min(20).max(400),
  document_rg: z.string().max(60).optional(),
  pix_key: z.string().max(120).optional(),
  pix_key_type: z.enum(pixTypes).optional(),
  confirm_identity: z.literal(true),
}).strict();

const digits = (value: string) => value.replace(/\D/g, '');

export function isValidBrazilianCpf(value: string | null | undefined): boolean {
  const cpf = digits(value || '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    const sum = [...cpf.slice(0, length)].reduce((acc, digit, index) =>
      acc + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    if (Number(cpf[length]) !== (remainder === 10 ? 0 : remainder)) return false;
  }
  return true;
}

export function isValidBrazilianCnpj(value: string | null | undefined): boolean {
  const cnpj = digits(value || '');
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  for (const length of [12, 13]) {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...cnpj.slice(0, length)].reduce((acc, digit, index) =>
      acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    if (Number(cnpj[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}

const hasText = (value: string | null | undefined) => Boolean(value?.trim());

export function isValidManagerPixKey(key: string, type: string | null | undefined): boolean {
  const value = key.trim();
  switch (type) {
    case 'cpf': return isValidBrazilianCpf(value);
    case 'cnpj': return isValidBrazilianCnpj(value);
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
    case 'phone': return /^(?:\+?55)?[1-9]\d{9,10}$/.test(value.replace(/[\s()-]/g, ''));
    case 'random': return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    default: return false;
  }
}

function commonManagerReviewMissingFields(profile: ManagerRegistrationProfile): string[] {
  const missing: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email || '')) missing.push('email');
  if (!/^(?:\+?55)?[1-9]\d{9,10}$/.test((profile.phone || '').replace(/[\s()-]/g, ''))) missing.push('phone');
  if (!profile.address?.trim() || profile.address.trim().length < 20) missing.push('address');
  if (hasText(profile.pix_key) && !isValidManagerPixKey(profile.pix_key!, profile.pix_key_type)) missing.push('pix_key');
  return missing;
}

// O cadastro próprio desta etapa atende Gestor pessoa física.
export function managerRegistrationMissingFields(profile: ManagerRegistrationProfile): string[] {
  const missing = commonManagerReviewMissingFields(profile);
  if (!hasText(profile.full_name)) missing.push('full_name');
  if (!isValidBrazilianCpf(profile.document_cpf)) missing.push('cpf');
  return missing;
}

export function planManagerSelfRegistration(
  raw: unknown,
  profile: ManagerRegistrationProfile,
): { ok: true; changes: ManagerRegistrationChanges } | { ok: false; error: string } {
  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Revise os campos e confirme que os dados são seus.' };
  const input = parsed.data;
  const submittedCpf = digits(input.document_cpf?.trim() || '');
  const effectiveCpf = submittedCpf || profile.document_cpf || '';
  if (!isValidBrazilianCpf(effectiveCpf)) return { ok: false, error: 'Informe um CPF válido.' };

  const changes: ManagerRegistrationChanges = {};
  if (submittedCpf && digits(profile.document_cpf || '') !== submittedCpf) changes.document_cpf = submittedCpf;
  const address = input.address.trim().replace(/\s+/g, ' ');
  if (address !== (profile.address || '')) changes.address = address;
  const rg = input.document_rg?.trim();
  if (rg && rg !== profile.document_rg) changes.document_rg = rg;

  const pix = input.pix_key?.trim();
  if (pix) {
    if (!isValidManagerPixKey(pix, input.pix_key_type)) {
      return { ok: false, error: 'Confira a chave Pix e seu tipo.' };
    }
    if (pix !== profile.pix_key || input.pix_key_type !== profile.pix_key_type) {
      changes.pix_key = pix;
      changes.pix_key_type = input.pix_key_type;
    }
  } else if (hasText(profile.pix_key) && !isValidManagerPixKey(profile.pix_key!, profile.pix_key_type)) {
    return { ok: false, error: 'A chave Pix existente precisa ser corrigida.' };
  }

  const effective = { ...profile, ...changes };
  if (managerRegistrationMissingFields(effective).length) {
    return { ok: false, error: 'Antes de enviar, confirme nome, e-mail, telefone, CPF e endereço completos.' };
  }
  return { ok: true, changes };
}

export function managerDocumentVerificationMissingFields(
  profile: ManagerDocumentReviewProfile,
  confirmations: unknown,
): string[] {
  const missing = commonManagerReviewMissingFields(profile);
  if (profile.recipient_type === 'company' || profile.recipient_type === 'association') {
    if (!hasText(profile.company_name)) missing.push('company_name');
    if (!isValidBrazilianCnpj(profile.document_cnpj)) missing.push('cnpj');
    if (!hasText(profile.legal_representative_name)) missing.push('legal_representative_name');
    if (!isValidBrazilianCpf(profile.legal_representative_cpf)) missing.push('legal_representative_cpf');
  } else if (!profile.recipient_type || profile.recipient_type === 'individual') {
    if (!hasText(profile.full_name)) missing.push('full_name');
    if (!isValidBrazilianCpf(profile.document_cpf)) missing.push('cpf');
  } else {
    missing.push('recipient_type');
  }
  if (!Array.isArray(confirmations) || confirmations.length !== 8 ||
      !confirmations.every(value => value === true)) {
    missing.push('verification_confirmations');
  }
  return missing;
}

export function maskRegistrationCpf(value: string | null): string | null {
  if (!value) return null;
  const cpf = digits(value);
  return cpf.length === 11 ? '***.***.***-' + cpf.slice(-2) : 'Cadastrado (revisão pendente)';
}

export function maskRegistrationPix(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '****' : '****' + value.slice(-4);
}
