import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const controller = readFileSync(resolve(__dirname, '../src/controllers/compliance.controller.ts'), 'utf8');
const routes = readFileSync(resolve(__dirname, '../src/routes/compliance.ts'), 'utf8');

describe('Compliance admin identity contract', () => {
  it('uses the identity populated by authenticateAdmin for approve/reject', () => {
    const matches = controller.match(/admin\?\.id \|\| \(req as any\)\.userId/g) || [];
    expect(matches).toHaveLength(2);
  });

  it('keeps approve and reject restricted to SUPER_ADMIN', () => {
    expect(routes).toContain("'/admin/compliance/documents/:documentId/approve'");
    expect(routes).toContain("'/admin/compliance/documents/:documentId/reject'");
    const approve = routes.slice(
      routes.indexOf("'/admin/compliance/documents/:documentId/approve'"),
      routes.indexOf("'/admin/compliance/documents/:documentId/reject'")
    );
    expect(approve).toContain('authenticateAdmin');
    expect(approve).toContain('requireSuperAdmin');

    const reject = routes.slice(routes.indexOf("'/admin/compliance/documents/:documentId/reject'"));
    expect(reject).toContain('authenticateAdmin');
    expect(reject).toContain('requireSuperAdmin');
  });
});
