/**
 * Importador idempotente de bairros de Cariacica/ES.
 *
 * Reutiliza o serviço de preparação de cidade (city-preparation.service.ts),
 * que grava neighborhoods + neighborhood_geofences (coordinates JSON + geom
 * PostGIS via query PARAMETRIZADA) de forma idempotente e vincula os bairros
 * ao território operacional já existente de Cariacica.
 *
 * NÃO cria território duplicado, NÃO ativa a cidade e NÃO altera outras cidades.
 *
 * Uso:
 *   # Dry-run (não grava nada):
 *   npx tsx src/scripts/import-cariacica-neighborhoods.ts --dry-run
 *
 *   # Execução (grava):
 *   npx tsx src/scripts/import-cariacica-neighborhoods.ts --apply
 *
 * O território é resolvido automaticamente por (name/city_name = "Cariacica",
 * uf = "ES", level = "city"). Se não existir, o script aborta com instrução.
 */
import * as path from 'path';
import { prisma } from '../lib/prisma';
import {
  dryRunPrepareCity,
  executePrepareCity,
} from '../services/territory/city-preparation.service';

const GEOJSON_PATH = path.join(__dirname, '../../data/geojson/cariacica_bairros.geojson');

async function resolveCariacicaTerritoryId(): Promise<string | null> {
  // Não duplica: apenas localiza o território existente.
  const territory = await prisma.operational_territories.findFirst({
    where: {
      level: 'city',
      OR: [
        { city_name: 'Cariacica' },
        { name: 'Cariacica' },
      ],
      uf: 'ES',
    },
    select: { id: true, name: true, status: true },
  });
  return territory?.id ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run') || !apply;

  console.log('🗺️  KAVIAR — Preparação territorial de Cariacica/ES');
  console.log('===================================================\n');

  const territoryId = await resolveCariacicaTerritoryId();
  if (!territoryId) {
    console.error(
      '❌ Território operacional de Cariacica/ES (level=city, uf=ES) não encontrado.\n' +
        '   Crie/identifique o território antes de importar. NÃO criei território automaticamente.',
    );
    await prisma.$disconnect();
    process.exit(1);
    return;
  }

  const params = { territoryId, geojsonPath: GEOJSON_PATH, prisma };

  const { plan } = await dryRunPrepareCity(params);

  console.log(`Cidade:              ${plan.city}`);
  console.log(`UF:                  ${plan.uf ?? '—'}`);
  console.log(`Território:          ${plan.territory.name} (status=${plan.territory.status}, id=${plan.territory.id})`);
  console.log(`Gestor territorial:  ${plan.manager.found ? plan.manager.names.join(', ') : 'nenhum ativo'}`);
  console.log('');
  console.log(`Bairros no arquivo:  ${plan.totals.featuresInFile}`);
  console.log(`  válidos:           ${plan.totals.validNeighborhoods}`);
  console.log(`  com geofence:      ${plan.totals.withValidGeofence}`);
  console.log(`  geom. inválidas:   ${plan.totals.invalidGeometries}`);
  console.log(`  duplicidades:      ${plan.totals.duplicatesInFile}`);
  console.log(`  seriam criados:    ${plan.totals.toCreate}`);
  console.log(`  seriam atualizados:${plan.totals.toUpdate}`);
  console.log(`  vínculo território:${plan.totals.toLinkTerritory}`);
  console.log('');
  if (plan.risks.length) {
    console.log('⚠️  Riscos/pendências:');
    for (const r of plan.risks) console.log(`   - ${r}`);
    console.log('');
  }

  if (dryRun) {
    console.log('DRY-RUN: nenhuma gravação realizada. Use --apply para executar.');
    await prisma.$disconnect();
    return;
  }

  if (!plan.canProceed) {
    console.error('❌ Plano não pode prosseguir. Corrija as pendências acima.');
    await prisma.$disconnect();
    process.exit(1);
    return;
  }

  console.log('✍️  Executando importação idempotente...');
  const result = await executePrepareCity(params);
  console.log('');
  console.log('✅ Concluído:');
  console.log(`   criados:            ${result.created}`);
  console.log(`   atualizados:        ${result.updated}`);
  console.log(`   geofences gravadas: ${result.geofencesWritten}`);
  console.log(`   vinculados ao terr.:${result.linkedToTerritory}`);
  if (result.errors.length) {
    console.log(`   erros:              ${result.errors.length}`);
    for (const e of result.errors) console.log(`     - ${e.name}: ${e.error}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
