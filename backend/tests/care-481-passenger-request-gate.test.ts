import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

describe('CARE-481 passenger public request gate', () => {
  it('keeps CARE passenger request disabled by default in the mobile selector', () => {
    const config = read('../src/config/care.config.ts');
    const selector = read('../src/components/passenger/ServiceSelector.tsx');

    expect(config).toContain('publicRequestEnabled: false');
    expect(selector).toContain('carePublicRequestEnabled?: boolean');
    expect(selector).toContain('carePublicRequestEnabled = false');
    expect(selector).toContain('carePublicRequestEnabled ?');
    expect(selector.indexOf('carePublicRequestEnabled ?')).toBeLessThan(
      selector.indexOf("onPress={() => onSelect('care_assisted')}"),
    );
    expect(selector).toContain('title="KAVIAR Care"');
    expect(selector).toContain('statusText="Em implantação."');
  });

  it('guards passenger map selection, online payload and offline queue while CARE is disabled', () => {
    const map = read('../app/(passenger)/map.tsx');

    expect(map).toContain('CARE_FLAGS.publicRequestEnabled');
    expect(map).toContain("if (service === 'care_assisted')");
    expect(map).toContain('if (!carePublicRequestEnabled)');
    expect(map).toContain("carePublicRequestEnabled && selectedService === 'care_assisted'");
    expect(map).not.toContain("...(selectedService === 'care_assisted' ? {");
    expect((map.match(/public_assisted_ride/g) || [])).toHaveLength(2);
  });
});
