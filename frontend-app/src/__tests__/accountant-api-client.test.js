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
});
