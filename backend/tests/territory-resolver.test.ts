import { describe, expect, it } from 'vitest';
import { buildTerritoryResolutionWhere } from '../src/scripts/prepare-city';

// ─────────────────────────────────────────────────────────────────────────────
// Resolver de território GENÉRICO (por cidade+UF). Preserva:
//   - level = 'city'
//   - uf exata e normalizada em MAIÚSCULAS
//   - match de city_name OU name CASE-INSENSITIVE
//   - sem lógica específica de cidade
//
// Como buildTerritoryResolutionWhere é puro, os testes simulam o comportamento
// de match do Prisma (equals + mode:'insensitive') sobre linhas fictícias.
// ─────────────────────────────────────────────────────────────────────────────

interface TerrRow {
  id: string;
  name: string | null;
  city_name: string | null;
  uf: string | null;
  level: string;
}

/** Simula prisma.findFirst(where) para o where gerado pelo builder. */
function matchesWhere(where: any, row: TerrRow): boolean {
  if (where.level && row.level !== where.level) return false;
  if (where.uf !== undefined && row.uf !== where.uf) return false; // uf: equals exato
  if (Array.isArray(where.OR)) {
    const ok = where.OR.some((clause: any) => {
      const [field, cond] = Object.entries(clause)[0] as [string, any];
      const val = (row as any)[field];
      if (val == null) return false;
      if (cond && typeof cond === 'object' && 'equals' in cond) {
        if (cond.mode === 'insensitive') {
          return String(val).toLowerCase() === String(cond.equals).toLowerCase();
        }
        return String(val) === String(cond.equals);
      }
      return String(val) === String(cond);
    });
    if (!ok) return false;
  }
  return true;
}

function findFirst(where: any, rows: TerrRow[]): TerrRow | null {
  return rows.find((r) => matchesWhere(where, r)) ?? null;
}

// Dado de produção real (valores em minúsculo)
const PROD_CARIACICA: TerrRow = {
  id: '72d612c7-cbb9-4c6f-8aa7-9af73b7637fa',
  name: 'cariacica — ES',
  city_name: 'cariacica',
  uf: 'ES',
  level: 'city',
};

describe('buildTerritoryResolutionWhere — formato do filtro', () => {
  it('mantém level=city, uf em MAIÚSCULAS e OR case-insensitive', () => {
    const where = buildTerritoryResolutionWhere('Cariacica', 'es');
    expect(where.level).toBe('city');
    expect(where.uf).toBe('ES'); // normalizada em maiúsculas
    expect(where.OR).toEqual([
      { city_name: { equals: 'Cariacica', mode: 'insensitive' } },
      { name: { equals: 'Cariacica', mode: 'insensitive' } },
    ]);
  });

  it('sem uf informada, não inclui filtro de uf', () => {
    const where = buildTerritoryResolutionWhere('Cariacica');
    expect(where.uf).toBeUndefined();
  });

  it('faz trim do nome da cidade', () => {
    const where = buildTerritoryResolutionWhere('  Cariacica  ', ' es ');
    expect(where.OR[0].city_name.equals).toBe('Cariacica');
    expect(where.uf).toBe('ES');
  });
});

describe('resolução case-insensitive (comportamento)', () => {
  it('argumento "Cariacica" encontra city_name="cariacica"', () => {
    const where = buildTerritoryResolutionWhere('Cariacica', 'ES');
    const found = findFirst(where, [PROD_CARIACICA]);
    expect(found?.id).toBe('72d612c7-cbb9-4c6f-8aa7-9af73b7637fa');
  });

  it('argumento minúsculo "vila velha" encontra name="Vila Velha" (só difere na capitalização)', () => {
    // name difere apenas por capitalização em relação ao argumento (equality case-insensitive)
    const row: TerrRow = { id: 'vv', name: 'Vila Velha', city_name: null, uf: 'ES', level: 'city' };
    const where = buildTerritoryResolutionWhere('vila velha', 'ES');
    const found = findFirst(where, [row]);
    expect(found?.id).toBe('vv');
  });

  it('NÃO casa território de outra UF', () => {
    const outraUf: TerrRow = { ...PROD_CARIACICA, uf: 'MG' };
    const where = buildTerritoryResolutionWhere('Cariacica', 'ES');
    expect(findFirst(where, [outraUf])).toBeNull();
  });

  it('NÃO casa território com level diferente de city', () => {
    const naoCity: TerrRow = { ...PROD_CARIACICA, level: 'region' };
    const where = buildTerritoryResolutionWhere('Cariacica', 'ES');
    expect(findFirst(where, [naoCity])).toBeNull();
  });

  it('isola por UF: com uf=ES não casa registro homônimo de outra UF', () => {
    const rows: TerrRow[] = [
      { id: 'es', name: 'cariacica — ES', city_name: 'cariacica', uf: 'ES', level: 'city' },
      { id: 'sp', name: 'cariacica (SP falso)', city_name: 'cariacica', uf: 'SP', level: 'city' },
    ];
    const where = buildTerritoryResolutionWhere('Cariacica', 'ES');
    const found = findFirst(where, rows);
    expect(found?.id).toBe('es');
  });
});
