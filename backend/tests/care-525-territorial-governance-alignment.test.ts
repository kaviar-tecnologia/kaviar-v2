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
  it('implements explicit city/region coverage governance without changing the state machine', () => {
    expect(adminAi).toContain("['city', 'region'].includes(territory.level)");
    expect(adminAi).toContain("territory.level === 'region'");
    expect(adminAi).toContain('coverage_status: target_status');
    expect(adminAi).toContain('coverage_reviewed_at: reviewedAt');
    expect(adminAi).toContain('coverage_reviewed_by: reviewedBy');
    expect(adminAi).toContain('resolveCoverageTransition');
    expect(adminAi).toContain('COVERAGE_GEOFENCE_INCOMPLETE');
    expect(adminAi).toContain('COVERAGE_REVIEW_INCOMPLETE');
  });

  it('requires valid regional geofences and reviewed neighborhoods before COMPLETE', () => {
    expect(adminAi).toContain('ST_IsValid(ng.geom)');
    expect(adminAi).toContain('ST_SRID(ng.geom) = 4326');
    expect(adminAi).toContain('verified_neighborhoods');
    expect(adminAi).toContain(
      'stats.valid_geofences !== stats.official_neighborhoods',
    );
    expect(adminAi).toContain(
      'stats.verified_neighborhoods !== stats.official_neighborhoods',
    );
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
      'sem autorização para merge, deploy, alteração de banco de produção',
    );
  });

  it('documents the authorized branch implementation without weakening fail-closed controls', () => {
    expect(auditDoc).toContain('Implementação autorizada na branch — 07/10/2026');
    expect(auditDoc).toContain('Revisão auditável de bairro/geofence');
    expect(auditDoc).toContain('Governança regional de coverage_status');
    expect(auditDoc).toContain('Os resolvers CARE não foram afrouxados');
    expect(auditDoc).toContain('não fazer merge');
    expect(auditDoc).toContain('não fazer deploy');
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


  it('records the preferred regional coverage model for the CARE pilot', () => {
    expect(auditDoc).toContain('Reavaliação arquitetural — escopo regional para o piloto CARE');
    expect(auditDoc).toContain(
      '`city.coverage_status`: completude municipal',
    );
    expect(auditDoc).toContain(
      '`region.coverage_status`: completude operacional daquela região',
    );
    expect(auditDoc).toContain(
      'A proposta anterior de fazer o CARE herdar obrigatoriamente o `coverage_status` do ancestral municipal não é mais a opção preferencial',
    );
    expect(auditDoc).toContain(
      'generalizar a governança de cobertura para um território explícito `city` ou `region`',
    );
    expect(auditDoc).toContain(
      'para `region`, considerar apenas bairros vinculados àquela região',
    );
  });


  it('records Barra as geometrically complete but not administratively verified', () => {
    expect(auditDoc).toContain('Evidência read-only — escopo regional Barra da Tijuca');
    expect(auditDoc).toContain('Foram encontrados exatamente **8 bairros oficiais ativos**');
    expect(auditDoc).toContain('com geofence válida: 8');
    expect(auditDoc).toContain('geofences ausentes ou inválidas: 0');
    expect(auditDoc).toContain('`is_verified=true`: 0/8');
    expect(auditDoc).toContain(
      'a Barra **ainda não está homologada**',
    );
    expect(auditDoc).toContain(
      'o item 12 do dry-run permanece `NO-GO`',
    );
  });


  it('records the missing administrative neighborhood review workflow', () => {
    expect(auditDoc).toContain('Lacuna administrativa — revisão de bairros');
    expect(auditDoc).toContain(
      '`PATCH /api/admin/communities/:id/geofence-review`',
    );
    expect(auditDoc).toContain(
      'não existe hoje um caminho administrativo canônico identificado',
    );
    expect(auditDoc).toContain(
      'Não usar atualização SQL direta dos oito bairros como solução operacional',
    );
  });


  it('adds a read-only regional coverage readiness endpoint', () => {
    expect(adminAi).toContain(
      "'/territory/coverage/:territoryId/readiness'",
    );
    expect(adminAi).toContain('can_submit_review');
    expect(adminAi).toContain('can_complete');
    expect(adminAi).toContain('official_neighborhoods');
    expect(adminAi).toContain('valid_geofences');
    expect(adminAi).toContain('verified_neighborhoods');
  });

  it('adds explicit audited neighborhood geofence review with compare-and-set', () => {
    expect(adminAi).toContain(
      "'/territory/neighborhoods/:id/review'",
    );
    expect(adminAi).toContain('VERIFICAR_BAIRRO_GEOFENCE');
    expect(adminAi).toContain('REABRIR_BAIRRO_GEOFENCE');
    expect(adminAi).toContain('expected_verified');
    expect(adminAi).toContain('COVERAGE_NOT_AWAITING_REVIEW');
    expect(adminAi).toContain('NEIGHBORHOOD_GEOFENCE_NOT_VERIFIABLE');
    expect(adminAi).toContain(
      "action: verified\n          ? 'territory_neighborhood_geofence_verify'",
    );
    expect(adminAi).toContain('is_verified: expected_verified');
  });

  it('keeps neighborhood review isolated from CARE activation and financial flows', () => {
    const reviewRoute =
      adminAi.split("'/territory/neighborhoods/:id/review'")[1]
        ?.split("router.post(\n  '/territory/coverage/status'")[0] || '';

    expect(reviewRoute).not.toContain('CARE_OFFICIAL_ENABLED');
    expect(reviewRoute).not.toContain('CARE_DISPATCH_ENABLED');
    expect(reviewRoute).not.toContain('wallet');
    expect(reviewRoute).not.toContain('payment');
    expect(reviewRoute).not.toContain('rides_v2.create');
  });

});
