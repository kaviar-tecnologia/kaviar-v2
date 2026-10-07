import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

const adminAi = fs.readFileSync(
  path.join(root, 'src/routes/admin-ai.ts'),
  'utf8',
);

const operationalEvidence = fs.readFileSync(
  path.join(root, 'src/services/care/care-operational-evidence.ts'),
  'utf8',
);

const verifiedScopeEvidence = fs.readFileSync(
  path.join(root, 'src/services/care/care-verified-scope-evidence.ts'),
  'utf8',
);

const auditDoc = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../docs/care/CARE-525-territorial-governance-alignment-audit.md',
  ),
  'utf8',
);

describe('CARE-525 — territorial governance alignment audit', () => {
  it('characterizes administrative coverage governance as city-level', () => {
    expect(adminAi).toContain("level: 'city'");
    expect(adminAi).toContain('coverage_status: target_status');
    expect(adminAi).toContain('coverage_reviewed_at: reviewedAt');
    expect(adminAi).toContain('coverage_reviewed_by: reviewedBy');
    expect(adminAi).toContain('child.parent_id = ${territory.id}');
    expect(adminAi).toContain("child.level = 'region'");
  });

  it('characterizes current governance COMPLETE guard as only requiring at least one official neighborhood', () => {
    expect(adminAi).toContain('officialNeighborhoods === 0');
    expect(adminAi).toContain('COVERAGE_WITHOUT_OFFICIAL_NEIGHBORHOODS');

    const coverageRoute = adminAi.split("'/territory/coverage/status'")[1] || '';
    expect(coverageRoute).not.toContain('ST_IsValid');
    expect(coverageRoute).not.toContain('ST_SRID');
    expect(coverageRoute).not.toContain('neighborhood_geofences');
  });

  it('characterizes CARE operational evidence as reading coverage from the neighborhood direct territory', () => {
    expect(operationalEvidence).toContain('territory: {');
    expect(operationalEvidence).toContain(
      "territory.coverage_status !== 'COMPLETE'",
    );
    expect(operationalEvidence).toContain('value.territory_id');
    expect(operationalEvidence).not.toContain('parent_id');
  });

  it('characterizes verified CARE scope as requiring reviewed neighborhood and direct territory COMPLETE', () => {
    expect(verifiedScopeEvidence).toContain('origin.is_verified === true');
    expect(verifiedScopeEvidence).toContain(
      "territory.coverage_status === 'COMPLETE'",
    );
    expect(verifiedScopeEvidence).toContain('origin.territory_id');
    expect(verifiedScopeEvidence).not.toContain('parent_id');
  });

  it('preserves exact pickup geofence verification with ST_Covers', () => {
    expect(verifiedScopeEvidence).toContain('ST_Covers(');
    expect(verifiedScopeEvidence).toContain('ST_IsValid(ng.geom)');
    expect(verifiedScopeEvidence).toContain('ST_SRID(ng.geom) = 4326');
    expect(verifiedScopeEvidence).not.toContain('ST_DWithin');
  });

  it('documents the observed Rio hierarchy mismatch without authorizing data mutation', () => {
    expect(auditDoc).toContain(
      'Rio de Janeiro `city` -> Barra da Tijuca `region` -> Itanhangá',
    );
    expect(auditDoc).toContain('172 bairros oficiais ativos');
    expect(auditDoc).toContain('161 bairros com geofence válida');
    expect(auditDoc).toContain('0 bairros com `is_verified=true`');
    expect(auditDoc).toContain('item 12 — território + regulação: `NO-GO`');
    expect(auditDoc).toContain(
      'não autoriza merge, deploy, alteração de banco de produção',
    );
  });

  it('documents the preferred correction without weakening fail-closed controls', () => {
    expect(auditDoc).toContain('manter a governança municipal');
    expect(auditDoc).toContain('resolver o ancestral municipal no CARE');
    expect(auditDoc).toContain('bairro continua sendo evidência específica');
    expect(auditDoc).toContain('COMPLETE deve ser fail-closed');
    expect(auditDoc).toContain('preservar ST_Covers');
    expect(auditDoc).toContain(
      'Nenhuma destas mudanças é implementada neste PR de auditoria.',
    );
  });

  it('keeps insurance and municipal evidence independent from territorial coverage', () => {
    expect(verifiedScopeEvidence).toContain(
      'CARE_SCOPE_MUNICIPAL_RECORD_MISSING',
    );
    expect(verifiedScopeEvidence).toContain(
      'CARE_SCOPE_INSURANCE_COVERAGE_MISSING',
    );
    expect(auditDoc).toContain('regulação CARE exata continua obrigatória');
    expect(auditDoc).toContain(
      'seguro CARE exato e vínculo do motorista continuam obrigatórios',
    );
  });

  it('records the exact Rio gap classification without auto-fixing data', () => {
    expect(auditDoc).toContain('10 registros sem linha em `neighborhood_geofences`');
    expect(auditDoc).toContain('Caju | Centro | `GEOM_INVALID`');
    expect(auditDoc).toContain('Tijuquinha | Tijuca | `NO_GEOFENCE_ROW`');
    expect(auditDoc).toContain(
      'alguns nomes hoje presentes como `BAIRRO_OFICIAL` foram tratados em outros fluxos como comunidades/localidades',
    );
    expect(auditDoc).toContain('não executar `ST_MakeValid` automaticamente em produção');
    expect(auditDoc).toContain(
      'inspecionar metadados e possíveis aliases/duplicatas dos 11 registros',
    );
  });


  it('records the official-source preliminary classification of the Rio gaps', () => {
    expect(auditDoc).toContain('Bairros oficiais confirmados');
    expect(auditDoc).toContain('**Caju**');
    expect(auditDoc).toContain('**Oswaldo Cruz**');
    expect(auditDoc).toContain('**Turiaçu**');
    expect(auditDoc).toContain('Registro genérico ambíguo');
    expect(auditDoc).toContain('**Freguesia**');
    expect(auditDoc).toContain(
      'Localidades/comunidades que não devem ser promovidas automaticamente a bairro oficial',
    );
    expect(auditDoc).toContain('**Tijuquinha**');
    expect(auditDoc).toContain('**Morro do Banco**');
    expect(auditDoc).toContain('**Mata Machado**');
    expect(auditDoc).toContain('**Furnas**');
    expect(auditDoc).toContain(
      'Antes de qualquer reclassificação/desativação, é obrigatório medir todas as referências desses IDs',
    );
  });


  it('records the KAVIAR domain rule for Tijuquinha', () => {
    expect(auditDoc).toContain(
      'Tijuquinha deve ser tratada como comunidade da Zona Oeste vinculada à Barra da Tijuca',
    );
    expect(auditDoc).toContain(
      'o vínculo atual com o território regional `Tijuca` também é incompatível',
    );
    expect(auditDoc).toContain(
      'não deve criar uma geofence de **bairro oficial** para Tijuquinha',
    );
  });


  it('records the production reference audit for the 11 Rio records', () => {
    expect(auditDoc).toContain('Auditoria de referências dos 11 registros');
    expect(auditDoc).toContain('Caju: 1');
    expect(auditDoc).toContain('Castelo: 1');
    expect(auditDoc).toContain('Cinelândia: 1');
    expect(auditDoc).toContain('Freguesia: 1');
    expect(auditDoc).toContain('Oswaldo Cruz: 1');
    expect(auditDoc).toContain('Santana: 1');
    expect(auditDoc).toContain('Turiaçu: 1');
    expect(auditDoc).toContain(
      'não possuem nenhuma referência por chave estrangeira nas tabelas auditadas',
    );
    expect(auditDoc).toContain(
      'nenhuma migração de usuários ou corridas é necessária para esses 11 registros',
    );
  });


  it('records that the four suspect names have no canonical communities in production', () => {
    expect(auditDoc).toContain('Auditoria de comunidades canônicas em produção');
    expect(auditDoc).toContain('nenhum registro correspondente foi encontrado');
    expect(auditDoc).toContain(
      'não possui uma chave estrangeira direta de comunidade para bairro',
    );
    expect(auditDoc).toContain(
      'resolve primeiro comunidade e depois bairro por interseção espacial independente',
    );
    expect(auditDoc).toContain(
      'exige uma etapa explícita de modelagem/carga de comunidade',
    );
  });

});
