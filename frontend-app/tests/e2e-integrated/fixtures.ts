/**
 * Shared fixtures and helpers for integrated E2E tests.
 * Uses real auth tokens and real API calls — no mocking.
 */
import { test as base, expect, Page } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Auth state ───────────────────────────────────────────────────────────────

// Safety check: prevent accidental production connection
const E2E_DB_URL = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || '';
if (E2E_DB_URL) {
  try {
    const parsed = new URL(E2E_DB_URL);
    const allowedHosts = ['127.0.0.1', 'localhost', '[::1]', 'postgres'];
    if (!allowedHosts.includes(parsed.hostname)) {
      throw new Error(`[E2E SAFETY] Hostname "${parsed.hostname}" is not local. Aborting.`);
    }
  } catch (e: any) {
    if (e.message.includes('E2E SAFETY')) throw e;
  }
}

interface AuthState {
  superAdminToken: string;
  superAdminEmail: string;
}

function loadAuthState(): AuthState {
  const path = resolve(__dirname, '.auth/state.json');
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    // Fallback: try login inline (for when globalSetup isn't used)
    return { superAdminToken: '', superAdminEmail: 'admin@kaviar.com' };
  }
}

// ── Test fixture with real authentication ────────────────────────────────────

export const test = base.extend<{ authToken: string }>({
  authToken: async ({}, use) => {
    const state = loadAuthState();
    if (!state.superAdminToken) {
      // Attempt login directly
      const res = await fetch('http://127.0.0.1:3003/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@kaviar.com', password: 'admin123' }),
      });
      if (res.ok) {
        const json = await res.json();
        state.superAdminToken = json.data?.token || json.token;
      }
    }
    await use(state.superAdminToken);
  },
});

export { expect };

// ── Auth injection helper ────────────────────────────────────────────────────

export async function injectAuth(page: Page, token: string, adminData?: any) {
  const data = adminData || { id: 'admin-seed', name: 'Admin Kaviar', email: 'admin@kaviar.com', role: 'SUPER_ADMIN' };
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token, adminData: JSON.stringify(data) });
}

// ── API helpers (no mock, real requests) ─────────────────────────────────────

const API_BASE = 'http://127.0.0.1:3003';

export async function apiGet(path: string, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function apiPost(path: string, body: any, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function apiPatch(path: string, body: any, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── Unique ID generator for test isolation ───────────────────────────────────

export function uniqueCode(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

// ── Monetary helpers (string-only, no Number) ────────────────────────────────

export function centsStr(reais: string): string {
  // "150.00" → "15000" (string only)
  const [intPart, fracPart = ''] = reais.split('.');
  return intPart + fracPart.padEnd(2, '0');
}
