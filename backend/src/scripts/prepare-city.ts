/**
 * CLI genérica de preparação territorial de uma cidade.
 *
 * Resolve o território existente e o dataset (GeoJSON) por (city, uf) usando o
 * registro genérico — SEM lógica especial de cidade. Onboardar nova cidade =
 * registrar no manifesto + colocar o arquivo. Nenhuma mudança de código.
 *
 * Uso:
 *   # Dry-run (não grava):
 *   npx tsx src/scripts/prepare-city.ts --city "Cariacica" --uf ES --dry-run
 *
 *   # Execução (grava; idempotente):
 *   npx tsx src/scripts/prepare-city.ts --city "Cariacica" --uf ES --apply
 *
 * Regras de segurança (inalteradas):
 *   - NÃO cria território (aborta se não existir);
 *   - NÃO ativa a cidade nem libera modalidades;
 *   - bairros entram com is_verified=false;
 *   - dry-run por padrão; --apply exige plano válido.
 */
import { prisma } from '../lib/prisma';
import {
  dryRunPrepareCity,
  executePrepareCity,
} from '../services/territory/city-preparation.service';
import { resolveGeojsonPath } from '../services/territory/territorial-dataset-registry';

interface Args {
  city?: string;
  uf?: string;
  apply: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { apply: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--city') out.city = argv[++i];
    else if (a === '--uf') out.uf = argv[++i];
    else if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.dryRun = true;
  }
  // dry-run é o default quando --apply não é passado.
  if (!out.apply) out.dryRun = true;
  return out;
}

/**
 * Constrói o filtro (where) GENÉRICO de resolução de território por cidade+UF.
 * Puro/testável — sem DB. Regras:
 *   - level = 'city' (sempre);
 *   - match de `city_name` OU `name` de forma CASE-INSENSITIVE (mode:'insensitive');
 *   - `uf` exata e normalizada em MAIÚSCULAS (quando informada);
 *   - não cria nada; apenas descreve o filtro de leitura.
 */
export function buildTerritoryResolutionWhere(city: string, uf?: string | null) {
  const name = (city ?? '').trim();
  const where: any = {
    level: 'city',
    OR: [
      { city_name: { equals: name, mode: 'insensitive' } },
      { name: { equals: name, mode: 'insensitive' } },
    ],
  };
  const normUf = (uf ?? '').trim().toUpperCase();
  if (normUf) where.uf = normUf;
  return where;
}

async function resolveTerritoryId(city: string, uf?: string): Promise<string | null> {
  // Genérico: localiza território existente por cidade+uf (não cria).
  const t = await prisma.operational_territories.findFirst({
    where: buildTerritoryResolutionWhere(city, uf),
    select: { id: true, name: true, status: true },
  });
  return t?.id ?? null;
}

export async function runPrepareCity(args: Args): Promise<number> {
  if (!args.city) {
    console.error('❌ Informe --city "<Cidade>" [--uf <UF>] [--dry-run|--apply]');
    return 2;
  }

  console.log('🗺️  KAVIAR — Preparação territorial de cidade');
  console.log('==============================================\n');

  const resolved = resolveGeojsonPath(args.city, args.uf);
  if (!resolved) {
    console.error(
      `❌ Nenhum dataset territorial registrado para "${args.city}"${args.uf ? '/' + args.uf : ''}.\n` +
        '   Adicione uma entrada em backend/data/geojson/territorial-datasets.json e o arquivo GeoJSON.',
    );
    return 1;
  }

  const territoryId = await resolveTerritoryId(args.city, args.uf);
  if (!territoryId) {
    console.error(
      `❌ Território operacional (level=city) para "${args.city}"${args.uf ? '/' + args.uf : ''} não encontrado.\n` +
        '   Crie/identifique o território antes. NÃO crio território automaticamente.',
    );
    return 1;
  }

  const params = { territoryId, geojsonPath: resolved.filePath, city: args.city, prisma };
  const { plan } = await dryRunPrepareCity(params);

  console.log(`Dataset:             ${resolved.dataset.file} (sourceVerified=${resolved.dataset.sourceVerified === true})`);
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

  if (args.dryRun && !args.apply) {
    console.log('DRY-RUN: nenhuma gravação realizada. Use --apply para executar.');
    return 0;
  }

  if (!plan.canProceed) {
    console.error('❌ Plano não pode prosseguir. Corrija as pendências acima.');
    return 1;
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
  return 0;
}

// Executa apenas quando chamado diretamente (permite wrappers de compatibilidade).
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  runPrepareCity(args)
    .then(async (code) => {
      await prisma.$disconnect();
      process.exit(code);
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
