/**
 * Wrapper de compatibilidade — Cariacica/ES.
 *
 * Mantido para não quebrar comandos/documentação existentes. Delega ao fluxo
 * GENÉRICO (prepare-city), que resolve território e dataset por (city, uf) a
 * partir do registro territorial. Nenhuma lógica especial de Cariacica aqui.
 *
 * Uso:
 *   npx tsx src/scripts/import-cariacica-neighborhoods.ts --dry-run
 *   npx tsx src/scripts/import-cariacica-neighborhoods.ts --apply
 */
import { prisma } from '../lib/prisma';
import { runPrepareCity } from './prepare-city';

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run') || !apply;

  const code = await runPrepareCity({ city: 'Cariacica', uf: 'ES', apply, dryRun });
  await prisma.$disconnect();
  process.exit(code);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
