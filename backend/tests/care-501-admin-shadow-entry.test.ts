import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-501 admin shadow entry', () => {
  it('adds a protected SUPER_ADMIN-only admin route for the shadow harness', () => {
    const route = readFileSync('src/routes/admin-care-shadow.ts', 'utf8');
    const app = readFileSync('src/app.ts', 'utf8');

    expect(route).toContain("import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth'");
    expect(route).toContain('router.use(authenticateAdmin, requireSuperAdmin)');
    expect(route).toContain("router.post('/harness'");
    expect(route).toContain('runCareShadowAuditHarnessTx');
    expect(route).toContain('prisma.$transaction');
    expect(route).toContain('ADMIN_CARE_SHADOW_AUDIT_HARNESS');
    expect(route).toContain('CARE_SHADOW_HARNESS_INPUT_INVALID');
    expect(route).toContain('CARE_SHADOW_HARNESS_FAILED');

    expect(app).toContain("import adminCareShadowRoutes from './routes/admin-care-shadow'");
    expect(app).toContain("app.use('/api/admin/care-shadow', adminCareShadowRoutes)");
  });

  it('keeps the admin entry shadow-only and operationally blocked', () => {
    const route = readFileSync('src/routes/admin-care-shadow.ts', 'utf8');

    expect(route).toContain('operationAllowed: false');
    expect(route).toContain('dispatchAllowed: false');
    expect(route).toContain('acceptanceAllowed: false');
    expect(route).toContain('walletAllowed: false');
    expect(route).toContain('CARE_UNAVAILABLE_CODE');

    expect(route).not.toContain('dispatchRide');
    expect(route).not.toContain('acceptOffer');
    expect(route).not.toContain('calculateFare');
    expect(route).not.toContain('WalletSettlementService');
    expect(route).not.toContain('createRide');
  });

  it('does not wire CARE shadow harness to passenger or driver operational flows', () => {
    const passengerRides = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatcher = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const pricing = readFileSync('src/services/pricing-engine.ts', 'utf8');
    const walletShadow = readFileSync('src/services/wallet-shadow.service.ts', 'utf8');

    expect(passengerRides).not.toContain('runCareShadowAuditHarnessTx');
    expect(dispatcher).not.toContain('runCareShadowAuditHarnessTx');
    expect(acceptance).not.toContain('runCareShadowAuditHarnessTx');
    expect(pricing).not.toContain('runCareShadowAuditHarnessTx');
    expect(walletShadow).not.toContain('runCareShadowAuditHarnessTx');
  });

  it('documents the admin-only scope and no production activation', () => {
    const doc = readFileSync('../docs/care/CARE-501-admin-shadow-entry.md', 'utf8');

    expect(doc).toContain('SUPER_ADMIN');
    expect(doc).toContain('sem rota pública');
    expect(doc).toContain('sem app passageiro');
    expect(doc).toContain('sem app motorista');
    expect(doc).toContain('sem dispatcher');
    expect(doc).toContain('sem aceite');
    expect(doc).toContain('sem pricing');
    expect(doc).toContain('sem wallet');
    expect(doc).toContain('sem migration');
    expect(doc).toContain('sem deploy');
  });
});
