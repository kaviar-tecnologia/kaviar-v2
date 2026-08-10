import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const publicSrc = readFileSync(resolve(__dirname, '../src/routes/public-city-lead.ts'), 'utf8');
const adminSrc = readFileSync(resolve(__dirname, '../src/routes/admin-driver-city-landings.ts'), 'utf8');
const appSrc = readFileSync(resolve(__dirname, '../src/app.ts'), 'utf8');

describe('public-city-lead.ts — GET /api/public/driver-city-landings/:slug', () => {
  it('queries database for city by slug', () => {
    expect(publicSrc).toContain('driver_city_landings.findUnique');
    expect(publicSrc).toContain('where: { slug:');
  });

  it('returns 404 if city not found or landing_enabled=false', () => {
    expect(publicSrc).toContain('!city || !city.landing_enabled');
    expect(publicSrc).toContain('res.status(404)');
  });

  it('returns only public-safe fields (no admin IDs in GET response)', () => {
    // The GET handler response block should only include public fields
    const getHandler = publicSrc.slice(
      publicSrc.indexOf("// Return only public-safe fields"),
      publicSrc.indexOf("// POST /api/public/city-lead")
    );
    expect(getHandler).toContain('city: city.city');
    expect(getHandler).toContain('state: city.state');
    expect(getHandler).toContain('slug: city.slug');
    expect(getHandler).toContain('public_status: city.public_status');
    expect(getHandler).toContain('whatsapp_number: city.whatsapp_number');
    // Should NOT expose admin fields in GET response
    expect(getHandler).not.toContain('created_by_admin_id');
    expect(getHandler).not.toContain('updated_by_admin_id');
  });

  it('does not expose id in public response', () => {
    // The response data block should not include id
    const responseBlock = publicSrc.slice(publicSrc.indexOf('// Return only public-safe fields'));
    expect(responseBlock).not.toMatch(/\bid: city\.id\b/);
  });
});

describe('public-city-lead.ts — POST /api/public/city-lead', () => {
  it('requires name, phone, and city_slug', () => {
    expect(publicSrc).toContain("!name || !phone || !city_slug");
  });

  it('validates name length >= 2', () => {
    expect(publicSrc).toContain('trimmedName.length < 2');
  });

  it('normalizes phone to digits only', () => {
    expect(publicSrc).toContain("String(phone).replace(/\\D/g, '')");
  });

  it('validates phone has at least 10 digits', () => {
    expect(publicSrc).toContain('digits.length < 10');
  });

  it('validates email format when provided', () => {
    expect(publicSrc).toContain('/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/');
  });

  it('validates city_slug against database (not hardcoded list)', () => {
    expect(publicSrc).toContain('driver_city_landings.findUnique');
    expect(publicSrc).toContain('!cityRecord || !cityRecord.landing_enabled');
    expect(publicSrc).not.toContain('ALLOWED_CITY_SLUGS');
  });

  it('validates modality accepts only CAR or MOTO', () => {
    expect(publicSrc).toContain("ALLOWED_MODALITIES = ['CAR', 'MOTO']");
    expect(publicSrc).toContain('!ALLOWED_MODALITIES.includes(mod)');
  });

  it('validates EAR accepts only YES or NO', () => {
    expect(publicSrc).toContain("ALLOWED_EAR = ['YES', 'NO']");
    expect(publicSrc).toContain('!ALLOWED_EAR.includes(earVal)');
  });

  it('sanitizes UTMs with max length', () => {
    expect(publicSrc).toContain('MAX_UTM_LEN');
    expect(publicSrc).toContain('.slice(0, MAX_UTM_LEN)');
  });

  it('truncates notes to max length', () => {
    expect(publicSrc).toContain('MAX_NOTES_LEN');
    expect(publicSrc).toContain('.slice(0, MAX_NOTES_LEN)');
  });

  it('uses city/state from database as source of truth', () => {
    expect(publicSrc).toContain('cityRecord.city');
    expect(publicSrc).toContain('cityRecord.state');
  });

  it('does not accept city_name/state from request body for notes', () => {
    // destructured fields should NOT include city_name or state
    const destructLine = publicSrc.match(/const \{[^}]*\} = req\.body/);
    expect(destructLine).toBeTruthy();
    expect(destructLine[0]).not.toContain('city_name');
    expect(destructLine[0]).not.toContain(' state');
  });

  it('deduplicates by phone + city_slug', () => {
    expect(publicSrc).toContain('phone: digits');
    expect(publicSrc).toContain("source: 'CITY_LANDING'");
    expect(publicSrc).toContain('city_slug=');
    expect(publicSrc).toContain('res.status(409)');
  });

  it('forces lead_type to DRIVER server-side', () => {
    expect(publicSrc).toContain("lead_type: 'DRIVER'");
  });

  it('forces source to CITY_LANDING server-side', () => {
    expect(publicSrc).toContain("source: 'CITY_LANDING'");
  });

  it('client cannot override source or lead_type', () => {
    // These should be hardcoded, not from req.body
    const destructLine = publicSrc.match(/const \{[^}]*\} = req\.body/);
    expect(destructLine[0]).not.toContain('lead_type');
    // utm_source is fine (it's a UTM param), but bare 'source' as a standalone field is not
    expect(destructLine[0]).not.toMatch(/\bsource\b(?!_)/);
  });
});

describe('admin-driver-city-landings.ts', () => {
  it('uses authenticateAdmin and requireRole SUPER_ADMIN', () => {
    expect(adminSrc).toContain('authenticateAdmin');
    expect(adminSrc).toContain("requireRole(['SUPER_ADMIN'])");
  });

  it('has GET / to list all cities', () => {
    expect(adminSrc).toContain("router.get('/'");
    expect(adminSrc).toContain('driver_city_landings.findMany');
  });

  it('has POST / to create city', () => {
    expect(adminSrc).toContain("router.post('/'");
  });

  it('has PATCH /:id to update city', () => {
    expect(adminSrc).toContain("router.patch('/:id'");
  });

  it('validates public_status against allowed values', () => {
    expect(adminSrc).toContain('IMPLANTACAO');
    expect(adminSrc).toContain('RECRUTAMENTO');
    expect(adminSrc).toContain('OPERACAO');
    expect(adminSrc).toContain('PAUSADA');
    expect(adminSrc).toContain('VALID_STATUSES.includes');
  });

  it('prevents duplicate slugs', () => {
    expect(adminSrc).toContain('driver_city_landings.findUnique');
    expect(adminSrc).toContain('Slug já existe');
    expect(adminSrc).toContain('res.status(409)');
  });

  it('generates slug from city and state', () => {
    expect(adminSrc).toContain('toSlug');
    expect(adminSrc).toContain('normalize');
    expect(adminSrc).toContain('NFD');
  });

  it('does not implement DELETE', () => {
    expect(adminSrc).not.toContain("router.delete");
  });

  it('returns public_url in responses', () => {
    expect(adminSrc).toContain('/motorista/cidade/');
    expect(adminSrc).toContain('public_url');
  });

  it('has normalizeWhatsapp helper', () => {
    expect(adminSrc).toContain('function normalizeWhatsapp');
  });

  it('normalizes whatsapp to digits only', () => {
    expect(adminSrc).toContain("replace(/\\D/g, '')");
  });

  it('rejects whatsapp with fewer than 10 digits', () => {
    expect(adminSrc).toContain('pelo menos 10 dígitos');
    expect(adminSrc).toContain('digits.length < 10');
  });

  it('rejects whatsapp with more than 15 digits', () => {
    expect(adminSrc).toContain('no máximo 15 dígitos');
    expect(adminSrc).toContain('digits.length > 15');
  });

  it('stores only digits in whatsapp_number field', () => {
    // POST uses waResult.digits
    expect(adminSrc).toContain('whatsapp_number: waResult.digits');
  });

  it('applies normalizeWhatsapp in both POST and PATCH', () => {
    const postSection = adminSrc.slice(adminSrc.indexOf("router.post('/'"), adminSrc.indexOf("router.patch('/:id'"));
    const patchSection = adminSrc.slice(adminSrc.indexOf("router.patch('/:id'"));
    expect(postSection).toContain('normalizeWhatsapp');
    expect(patchSection).toContain('normalizeWhatsapp');
  });
});

describe('app.ts registration', () => {
  it('mounts admin driver-city-landings route', () => {
    expect(appSrc).toContain("'/api/admin/driver-city-landings'");
    expect(appSrc).toContain('adminDriverCityLandingsRoutes');
  });

  it('mounts public city-lead route', () => {
    expect(appSrc).toContain('publicCityLeadRoutes');
  });
});
