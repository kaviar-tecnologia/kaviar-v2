import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(resolve(__dirname, '../src/routes/public-manager-lead.ts'), 'utf8');
const appSrc = readFileSync(resolve(__dirname, '../src/app.ts'), 'utf8');

describe('public manager lead', () => {
  it('exposes POST /api/public/manager-lead', () => {
    expect(src).toContain("router.post('/manager-lead'");
    expect(appSrc).toContain('publicManagerLeadRoutes');
  });

  it('requires identity and territory-interest fields', () => {
    expect(src).toContain('!name || !phone || !city || !state');
    expect(src).toContain('Nome, WhatsApp, cidade e UF são obrigatórios');
  });

  it('normalizes phone and validates UF', () => {
    expect(src).toContain("String(phone).replace(/\\D/g, '')");
    expect(src).toContain('/^[A-Z]{2}$/');
  });

  it('forces CRM classification server-side', () => {
    expect(src).toContain("lead_type: 'TERRITORIAL_MANAGER'");
    expect(src).toContain("source: 'WEBSITE'");
    expect(src).toContain("status: 'NEW'");
    expect(src).toContain("priority: 'NORMAL'");
  });

  it('deduplicates active manager applications by phone', () => {
    expect(src).toContain("lead_type: 'TERRITORIAL_MANAGER'");
    expect(src).toContain("status: { notIn: ['LOST', 'REJECTED'] }");
    expect(src).toContain('res.status(409)');
  });

  it('links an existing city territory only when its id is UUID-safe', () => {
    expect(src).toContain('operational_territories.findFirst');
    expect(src).toContain("mode: 'insensitive'");
    expect(src).toContain('UUID_RE.test(territory.id)');
  });

  it('does not accept CRM status, type, source or priority from request body', () => {
    const destructLine = src.match(/const \{[^}]*\} = req\.body/);
    expect(destructLine).toBeTruthy();
    expect(destructLine[0]).not.toMatch(/\blead_type\b/);
    expect(destructLine[0]).not.toMatch(/\bsource\b(?!_)/);
    expect(destructLine[0]).not.toMatch(/\bstatus\b/);
    expect(destructLine[0]).not.toMatch(/\bpriority\b/);
  });
});
