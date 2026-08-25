import type { KaviarAiToolName } from './kaviar-ai.types';
import type { DriverPipelineSummaryData } from './kaviar-ai.command-center';

// ── Driver sub-intent types ──────────────────────────────────────────────────

export type DriverSubIntent =
  | 'DRIVER_PENDING_GENERAL'
  | 'DRIVER_PENDING_LIST'
  | 'DRIVER_STATUS'
  | 'DRIVER_DOCUMENTS'
  | 'DRIVER_COMPLIANCE'
  | 'DRIVER_MODALITIES'
  | 'DRIVER_RATINGS'
  | 'DRIVER_GENERAL';

// ── Tool preference per sub-intent ───────────────────────────────────────────

const DRIVER_SUBINTENT_TOOLS: Record<DriverSubIntent, KaviarAiToolName[]> = {
  DRIVER_PENDING_GENERAL: ['driver_pipeline_summary'],
  DRIVER_PENDING_LIST: ['driver_pending_list'],
  DRIVER_STATUS: ['driver_pipeline_summary'],
  DRIVER_DOCUMENTS: ['drivers_documents_pending'],
  DRIVER_COMPLIANCE: ['driver_pipeline_summary'],
  DRIVER_MODALITIES: ['driver_pipeline_summary'],
  DRIVER_RATINGS: ['driver_ratings_summary'],
  DRIVER_GENERAL: ['driver_pipeline_summary'],
};

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Classifies a question (already known to be DRIVERS intent) into a
 * specific driver sub-intent. Pure function, deterministic keyword matching.
 */
export function classifyDriverIntent(question: string): DriverSubIntent {
  const q = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // DRIVER_RATINGS — avaliações, notas
  if (
    q.includes('avaliacao') || q.includes('avaliacoes') ||
    q.includes('nota') || q.includes('estrela') ||
    q.includes('mal avaliado') || q.includes('notas baixas')
  ) {
    return 'DRIVER_RATINGS';
  }

  // DRIVER_DOCUMENTS — explicitly mentions documento/doc
  if (
    (q.includes('documento') || q.includes('doc ') || q.includes('docs ') ||
     q.includes('docs?') || q.includes('documentacao')) &&
    (q.includes('pendente') || q.includes('faltando') || q.includes('ausente') ||
     q.includes('aguardando') || q.includes('revisao') || q.includes('quantos'))
  ) {
    return 'DRIVER_DOCUMENTS';
  }

  // DRIVER_COMPLIANCE — explicitly mentions compliance
  if (
    q.includes('compliance') &&
    (q.includes('pendente') || q.includes('aguardando') || q.includes('quantos'))
  ) {
    return 'DRIVER_COMPLIANCE';
  }

  // DRIVER_MODALITIES — explicitly mentions modalidade
  if (
    (q.includes('modalidade') || q.includes('modalidades')) &&
    (q.includes('pendente') || q.includes('aguardando') || q.includes('aprovacao') || q.includes('quantas'))
  ) {
    return 'DRIVER_MODALITIES';
  }

  // DRIVER_PENDING_LIST — asks which/list/detail pending drivers
  // Also treat direct existence questions about drivers awaiting approval
  // as list requests, because the operational answer must identify the drivers.
  if (
    (q.includes('motorista') || q.includes('driver')) &&
    (q.includes('pendente') || q.includes('aguardando') || q.includes('aprovacao')) &&
    (
      q.includes('quais') ||
      q.includes('liste') ||
      q.includes('listar') ||
      q.includes('mostre') ||
      q.includes('mostrar') ||
      q.includes('detalhe') ||
      q.includes('detalhar') ||
      (
        (q.includes('ha motorista') || q.includes('ha motoristas')) &&
        (q.includes('aguardando') || q.includes('aprovacao'))
      )
    )
  ) {
    return 'DRIVER_PENDING_LIST';
  }

  // DRIVER_STATUS — explicitly mentions status, cadastro, pipeline
  if (
    q.includes('pipeline') || q.includes('funil de motorista') ||
    (q.includes('cadastro') && (q.includes('pendente') || q.includes('aguard'))) ||
    (q.includes('status') && q.includes('pending')) ||
    (q.includes('por status'))
  ) {
    return 'DRIVER_STATUS';
  }

  // DRIVER_PENDING_GENERAL — says "pendente" but NOT a specific category
  // This is the key case: broad/ambiguous "quantos pendentes?"
  if (
    (q.includes('pendente') || q.includes('pendencia') || q.includes('pendencias')) &&
    (q.includes('motorista') || q.includes('driver'))
  ) {
    return 'DRIVER_PENDING_GENERAL';
  }

  return 'DRIVER_GENERAL';
}

// ── Tool refinement ──────────────────────────────────────────────────────────

/**
 * Refines the tool list for DRIVERS intent based on the sub-intent.
 * Returns preferred tools for the sub-intent, filtered against what the
 * router/orchestrator already selected (never adds tools not in the
 * authorized set).
 *
 * If the preferred tool is not in `availableTools`, falls back to the
 * first available driver tool.
 */
export function refineDriverTools(
  subIntent: DriverSubIntent,
  availableTools: KaviarAiToolName[]
): KaviarAiToolName[] {
  const preferred = DRIVER_SUBINTENT_TOOLS[subIntent];
  const matching = preferred.filter(t => availableTools.includes(t));

  if (matching.length > 0) {
    return matching;
  }

  // Fallback: keep what's available (don't empty the list)
  return availableTools.slice(0, subIntent === 'DRIVER_PENDING_GENERAL' ? 2 : 1);
}

// ── Consolidated pending response formatter ──────────────────────────────────

/**
 * Formats a consolidated pending response for DRIVER_PENDING_GENERAL.
 * Shows each pendency category separately WITHOUT summing them.
 */
export function formatConsolidatedPending(data: DriverPipelineSummaryData): string {
  if (!data.available) {
    return 'Pipeline de motoristas: não foi possível consultar.';
  }

  const parts: string[] = [];
  parts.push('Há diferentes tipos de pendência entre os motoristas:');
  parts.push('');

  // Status pending (cadastro)
  parts.push(`• **${data.pendingApproval}** motorista${data.pendingApproval !== 1 ? 's' : ''} com cadastro/status pendente de aprovação;`);

  // Documents
  const totalDocsPending = data.docsMissing + data.docsSubmitted;
  if (totalDocsPending > 0 || data.docsRejected > 0) {
    const docDetail: string[] = [];
    if (data.docsMissing > 0) docDetail.push(`${data.docsMissing} com documento ausente`);
    if (data.docsSubmitted > 0) docDetail.push(`${data.docsSubmitted} aguardando revisão`);
    if (data.docsRejected > 0) docDetail.push(`${data.docsRejected} rejeitado${data.docsRejected !== 1 ? 's' : ''}`);
    parts.push(`• **${totalDocsPending + data.docsRejected}** com pendência documental:`);
    for (const d of docDetail) parts.push(`  - ${d};`);
  } else {
    parts.push('• Nenhuma pendência documental;');
  }

  // Compliance
  parts.push(`• **${data.compliancePending}** com compliance pendente;`);

  // Modalities
  if (data.modalities.available) {
    if (data.modalities.pending > 0) {
      parts.push(`• **${data.modalities.pending}** modalidade${data.modalities.pending !== 1 ? 's' : ''} aguardando aprovação.`);
    } else {
      parts.push('• Nenhuma modalidade pendente.');
    }
  } else {
    parts.push('• Modalidades: não foi possível consultar.');
  }

  parts.push('');
  parts.push('⚠️ Um mesmo motorista pode aparecer em mais de uma categoria. Esses números não devem ser somados.');
  parts.push('');
  parts.push('Se quiser, posso detalhar apenas uma dessas pendências.');

  return parts.join('\n');
}
