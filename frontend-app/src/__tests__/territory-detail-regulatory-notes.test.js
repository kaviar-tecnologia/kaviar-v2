/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('TerritoryDetailPage regulatory notes field', () => {
  const src = readFileSync(resolve(__dirname, '../pages/admin/TerritoryDetailPage.jsx'), 'utf8');

  it('uses local state instead of a noop onChange handler', () => {
    expect(src).toContain("const [regulatoryNotes, setRegulatoryNotes] = useState('')");
    expect(src).toContain('value={regulatoryNotes}');
    expect(src).toContain("onChange={(e) => setRegulatoryNotes(e.target.value)}");
    expect(src).not.toContain('onChange={() => {}}');
  });

  it('syncs the current territory value into the field state and persists the latest value on blur', () => {
    expect(src).toContain('setRegulatoryNotes(t.regulatory_notes || \'\')');
    expect(src).toContain('const nextValue = regulatoryNotes;');
    expect(src).toContain('regulatory_notes: nextValue');
    expect(src).toContain('setTerritory((prev) => prev ? { ...prev, regulatory_notes: updatedValue } : prev);');
  });
});
