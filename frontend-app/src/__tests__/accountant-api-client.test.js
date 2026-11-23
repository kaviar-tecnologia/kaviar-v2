/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('accountantApi configuration', () => {
  it('has withCredentials enabled', async () => {
    const { default: accountantApi } = await import('../services/accountantApi');
    expect(accountantApi.defaults.withCredentials).toBe(true);
  });
  
  it('has correct baseURL', async () => {
    const { default: accountantApi } = await import('../services/accountantApi');
    expect(accountantApi.defaults.baseURL).toBeDefined();
  });
  
  it('has timeout set', async () => {
    const { default: accountantApi } = await import('../services/accountantApi');
    expect(accountantApi.defaults.timeout).toBeGreaterThan(0);
  });
  
  it('does not use localStorage for tokens', () => {
    const code = readFileSync(resolve(__dirname, '../services/accountantApi.js'), 'utf8');
    expect(code).not.toContain('localStorage');
    expect(code).not.toContain('sessionStorage');
  });
  
  it('sets and clears access token in memory only', async () => {
    const { setAccountantAccessToken, clearAccountantAccessToken } = await import('../services/accountantApi');
    setAccountantAccessToken('test-token-123');
    // No localStorage write
    expect(localStorage.getItem('accountant_token')).toBeNull();
    expect(sessionStorage.getItem('accountant_token')).toBeNull();
    clearAccountantAccessToken();
  });

  it("omits immutable firm and CPF fields from edit payloads", async () => {
    const { buildAccountantPayload } = await import("../components/admin/accounting/AccountantFormDialog");
    const form = {
      nome_completo: "Contador Teste",
      email: "contador.com",
      cpf: "123.456.789-01",
      crc: "1234",
      crc_uf: "SP",
      accounting_firm_id: "firm-1",
      job_title: "Contador",
      department: "Fiscal",
      is_responsible_accountant: true,
    };

    const editPayload = buildAccountantPayload(form, "edit");
    expect(editPayload).not.toHaveProperty("accounting_firm_id");
    expect(editPayload).not.toHaveProperty("cpf");

    const createPayload = buildAccountantPayload(form, "create");
    expect(createPayload.accounting_firm_id).toBe("firm-1");
    expect(createPayload.cpf).toBe("12345678901");
  });
});
