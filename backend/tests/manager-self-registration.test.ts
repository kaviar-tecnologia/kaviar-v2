import { describe, expect, it } from 'vitest';
import {
  isValidBrazilianCpf,
  isValidBrazilianCnpj,
  isValidManagerPixKey,
  managerDocumentVerificationMissingFields,
  managerRegistrationMissingFields,
  planManagerSelfRegistration,
  maskRegistrationCpf,
  maskRegistrationPix,
  type ManagerRegistrationProfile,
} from '../src/services/territory/manager-self-registration';

const pending: ManagerRegistrationProfile = {
  full_name: 'Gestora Exemplo',
  email: 'gestora@example.com',
  phone: '21999990000',
  document_cpf: null,
  address: null,
  document_rg: null,
  pix_key: null,
  pix_key_type: null,
};
const fullAddress = 'Rua Exemplo, 123, Centro, Rio de Janeiro/RJ, CEP 20000-000';
const validCpf = '529.982.247-25'; // purely synthetic algorithm test vector

describe('manager self-registration policy', () => {
  it('validates CPF check digits and rejects repeated or malformed digits', () => {
    expect(isValidBrazilianCpf(validCpf)).toBe(true);
    expect(isValidBrazilianCpf('529.982.247-24')).toBe(false);
    expect(isValidBrazilianCpf('11111111111')).toBe(false);
    expect(isValidBrazilianCpf('123')).toBe(false);
  });

  it('requires consent, own CPF and full address; rejects mass assignment', () => {
    expect(planManagerSelfRegistration({
      document_cpf: validCpf, address: fullAddress, confirm_identity: true,
      document_status: 'verified',
    }, pending)).toMatchObject({ ok: false });
    expect(planManagerSelfRegistration({
      document_cpf: validCpf, address: fullAddress, confirm_identity: false,
    }, pending)).toMatchObject({ ok: false });
    expect(planManagerSelfRegistration({
      document_cpf: '11111111111', address: fullAddress, confirm_identity: true,
    }, pending)).toMatchObject({ ok: false });
    expect(planManagerSelfRegistration({
      document_cpf: validCpf, address: 'Rua 1', confirm_identity: true,
    }, pending)).toMatchObject({ ok: false });
  });

  it('saves only registration fields and preserves contract/activation identity', () => {
    const result = planManagerSelfRegistration({
      document_cpf: validCpf, address: fullAddress, document_rg: 'RG123',
      confirm_identity: true,
    }, pending);
    expect(result).toEqual({ ok: true, changes: {
      document_cpf: '52998224725', address: fullAddress, document_rg: 'RG123',
    } });
    if (result.ok) {
      expect(Object.keys(result.changes)).not.toContain('is_active');
      expect(Object.keys(result.changes)).not.toContain('contract_status');
      expect(Object.keys(result.changes)).not.toContain('document_status');
      expect(Object.keys(result.changes)).not.toContain('territory_id');
    }
  });

  it('accepts later edits without requiring the already saved CPF again', () => {
    const profile = { ...pending, document_cpf: '52998224725', address: fullAddress };
    expect(planManagerSelfRegistration({
      document_cpf: '', address: fullAddress, confirm_identity: true,
    }, profile)).toEqual({ ok: true, changes: {} });
  });

  it('keeps Pix optional for the contract but validates any registered key', () => {
    const profile = { ...pending, document_cpf: '52998224725', address: fullAddress };
    expect(managerRegistrationMissingFields(profile)).toEqual([]);
    expect(isValidManagerPixKey(validCpf, 'cpf')).toBe(true);
    expect(isValidManagerPixKey('not-an-email', 'email')).toBe(false);
    expect(planManagerSelfRegistration({
      address: fullAddress, pix_key: 'bad', pix_key_type: 'random', confirm_identity: true,
    }, profile)).toMatchObject({ ok: false });
  });

  it('does not accept a checklist alone without valid documents in the backend', () => {
    const confirmed = Array(8).fill(true);
    expect(managerDocumentVerificationMissingFields(pending, confirmed)).toContain('cpf');
    expect(managerDocumentVerificationMissingFields(pending, confirmed)).toContain('address');
    const complete = { ...pending, document_cpf: '52998224725', address: fullAddress };
    expect(managerDocumentVerificationMissingFields(complete, Array(7).fill(true))).toContain('verification_confirmations');
    expect(managerDocumentVerificationMissingFields(complete, Array(8).fill(true))).toEqual([]);
  });

  it('preserves company and association review with CNPJ and representative credentials', () => {
    const company = {
      ...pending, recipient_type: 'company', full_name: null, document_cpf: null,
      company_name: 'Empresa Exemplo Ltda', document_cnpj: '11.222.333/0001-81',
      legal_representative_name: 'Responsável Exemplo',
      legal_representative_cpf: '52998224725', address: fullAddress,
    };
    expect(isValidBrazilianCnpj(company.document_cnpj)).toBe(true);
    expect(managerDocumentVerificationMissingFields(company, Array(8).fill(true))).toEqual([]);
    expect(managerDocumentVerificationMissingFields({ ...company, recipient_type: 'association' }, Array(8).fill(true))).toEqual([]);
    expect(managerDocumentVerificationMissingFields({ ...company, document_cnpj: '11.222.333/0001-80' }, Array(8).fill(true))).toContain('cnpj');
    expect(managerDocumentVerificationMissingFields({ ...company, legal_representative_cpf: null }, Array(8).fill(true))).toContain('legal_representative_cpf');
    expect(isValidBrazilianCnpj('00000000000000')).toBe(false);
    // Exemplo do manual público da Receita Federal para o formato alfanumérico.
    expect(isValidBrazilianCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidBrazilianCnpj('12.ABC.345/01DE-34')).toBe(false);
    expect(isValidManagerPixKey('12ABC34501DE35', 'cnpj')).toBe(true);
    expect(isValidManagerPixKey('11222333000181', 'cnpj')).toBe(true);
  });

  it('does not expose full CPF or Pix key in the registration summary', () => {
    expect(maskRegistrationCpf('52998224725')).toBe('***.***.***-25');
    expect(maskRegistrationPix('long-sensitive-key')).toBe('****-key');
  });
});
