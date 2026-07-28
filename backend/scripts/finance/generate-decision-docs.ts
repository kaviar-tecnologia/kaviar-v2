/**
 * generate-decision-docs.ts
 *
 * Deterministic generator: reads phase-3c-2d-2b-decision-register.json and produces
 * the six Markdown documents for phase 3C-2D.2B.
 *
 * Rules:
 * - Same input always produces the same output (no timestamps, no random values).
 * - Decisions are sorted by decision_id before rendering.
 * - Markdown special characters in free-text fields are escaped.
 * - Validates counts and uniqueness before writing.
 * - Does NOT overwrite files whose content is already identical.
 * - Exits with a non-zero code and a clear message on any validation failure.
 *
 * Usage:
 *   tsx scripts/finance/generate-decision-docs.ts [--dry-run] [--out-dir <dir>]
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types (minimal — matches the JSON structure)
// ---------------------------------------------------------------------------

interface BonusRule {
  id: string;
  description: string;
  example?: string;
}

interface JournalEntry {
  event: string;
  debit: string;
  credit: string;
}

interface BonusPolicy {
  policy_id: string;
  approved_by: string;
  approved_at: string;
  last_updated?: string;
  status?: string;
  status_description?: string;
  frozen: boolean;
  summary: string;
  superseded_rules?: Record<string, string>;
  addendum_reference?: string;
  rules: BonusRule[];
  conceptual_journal_entries: JournalEntry[];
}

interface BusinessPolicies {
  bonus: BonusPolicy;
}

interface AdministrativeApproval {
  approved_by: string;
  approved_at: string;
  scope: string;
  note: string;
}

interface Decision {
  decision_id: string;
  responsible: 'ACCOUNTANT' | 'LEGAL' | 'ADMIN';
  scope: string;
  target_model: string;
  code: string;
  name: string;
  current_status: string;
  question: string;
  allowed_answers: string[];
  required_evidence: string[];
  source_notes: string;
  answer: string | null;
  approved_name: string | null;
  approved_type: string | null;
  accounting_treatment: string | null;
  tax_treatment: string | null;
  operational_rule: string | null;
  rationale: string | null;
  decided_by: string | null;
  decided_at: string | null;
  evidence_reference: string | null;
  resulting_blueprint_status: string | null;
  unblock_condition?: string;
  materialization_authorized: boolean;
  database_write_authorized: boolean;
}

interface DecisionRegister {
  phase: string;
  blueprint_version: string;
  decision_register_revision?: string;
  status: string;
  title: string;
  description: string;
  materialization_authorized: boolean;
  database_write_authorized: boolean;
  summary: {
    total_decisions: number;
    by_responsible: { ACCOUNTANT: number; LEGAL: number; ADMIN: number };
    by_status: { decided: number; open: number };
  };
  administrative_approval: AdministrativeApproval;
  business_policies: BusinessPolicies;
  decision_progress: { phase_start: string; admin_decisions_completed_at: string; next_step: string };
  decisions: Decision[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escMd(s: string | null | undefined): string {
  if (!s) return '';
  // Escape pipe, backtick, and leading # that could break Markdown tables/headers
  return s.replace(/\|/g, '\\|').replace(/`/g, "'");
}

function sortedDecisions(decisions: Decision[]): Decision[] {
  return [...decisions].sort((a, b) => a.decision_id.localeCompare(b.decision_id));
}

function renderDecisionBlock(d: Decision): string {
  const lines: string[] = [];
  lines.push(`## ${d.decision_id} — ${d.code} — ${escMd(d.name)}`);
  lines.push('');
  lines.push(`**Modelo:** \`${d.target_model}\`<br>`);
  lines.push(`**Status atual:** \`${d.current_status}\`<br>`);
  lines.push(`**Escopo:** \`${d.scope}\``);
  lines.push('');
  lines.push(`**Pergunta:** ${escMd(d.question)}`);
  lines.push('');
  lines.push(`**Contexto atual:** ${escMd(d.source_notes)}`);
  lines.push('');

  if (d.answer !== null) {
    lines.push(`**Resposta:** ${d.answer}`);
    if (d.approved_name) lines.push(`**Nome aprovado:** ${escMd(d.approved_name)}`);
    if (d.operational_rule) {
      lines.push('');
      lines.push('**Regra operacional:**');
      lines.push('');
      d.operational_rule.split('.').map(s => s.trim()).filter(Boolean).forEach(sentence => {
        lines.push(`- ${sentence}.`);
      });
    }
    if (d.rationale) {
      lines.push('');
      lines.push(`**Justificativa:** ${escMd(d.rationale)}`);
    }
    if (d.decided_by) lines.push(`**Decidido por:** ${escMd(d.decided_by)}`);
    if (d.decided_at) lines.push(`**Decidido em:** ${d.decided_at}`);
    if (d.evidence_reference) lines.push(`**Evidência:** ${escMd(d.evidence_reference)}`);
    if (d.resulting_blueprint_status) lines.push(`**Status resultante no blueprint:** \`${d.resulting_blueprint_status}\``);
    if (d.unblock_condition) {
      lines.push('');
      lines.push(`**Condição de desbloqueio:** ${escMd(d.unblock_condition)}`);
    }
  } else {
    lines.push('**Resposta:**');
    lines.push('');
    d.allowed_answers.forEach(a => lines.push(`- [ ] ${a}`));
    lines.push('');
    lines.push('**Justificativa e evidência:**');
    lines.push('');
    lines.push('____________________________________________');
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Document generators
// ---------------------------------------------------------------------------

function genAccountantQuestions(register: DecisionRegister): string {
  const decisions = sortedDecisions(register.decisions.filter(d => d.responsible === 'ACCOUNTANT'));
  const lines: string[] = [
    `# Fase ${register.phase} — Perguntas para Contador`,
    '',
    `Blueprint atual: \`${register.blueprint_version}\``,
    '',
    'Nenhum item deste documento está aprovado automaticamente.',
    'A resposta deverá ser registrada no arquivo de decisões.',
    '',
  ];
  decisions.forEach(d => lines.push(renderDecisionBlock(d)));
  return lines.join('\n');
}

function genLegalQuestions(register: DecisionRegister): string {
  const decisions = sortedDecisions(register.decisions.filter(d => d.responsible === 'LEGAL'));
  const lines: string[] = [
    `# Fase ${register.phase} — Perguntas para Jurídico`,
    '',
    `Blueprint atual: \`${register.blueprint_version}\``,
    '',
    'Nenhum item deste documento está aprovado automaticamente.',
    'A resposta deverá ser registrada no arquivo de decisões.',
    '',
  ];
  decisions.forEach(d => lines.push(renderDecisionBlock(d)));
  return lines.join('\n');
}

function genAdminQuestions(register: DecisionRegister): string {
  const decisions = sortedDecisions(register.decisions.filter(d => d.responsible === 'ADMIN'));
  const lines: string[] = [
    `# Fase ${register.phase} — Perguntas para Administração`,
    '',
    `Blueprint atual: \`${register.blueprint_version}\``,
    '',
    'Decisões administrativas registradas formalmente.',
    `Aprovação: ${register.administrative_approval.approved_by} em ${register.administrative_approval.approved_at}`,
    '',
  ];
  decisions.forEach(d => lines.push(renderDecisionBlock(d)));
  return lines.join('\n');
}

function genAdminDecision(register: DecisionRegister): string {
  const decisions = sortedDecisions(register.decisions.filter(d => d.responsible === 'ADMIN' && d.answer !== null));
  const approval = register.administrative_approval;
  const lines: string[] = [
    `# Fase ${register.phase} — Decisões Administrativas Aprovadas`,
    '',
    `**Aprovado por:** ${approval.approved_by}<br>`,
    `**Data:** ${approval.approved_at}<br>`,
    `**Escopo:** ${approval.scope}`,
    '',
    approval.note,
    '',
    '---',
    '',
    `Total de decisões administrativas aprovadas: **${decisions.length}**`,
    '',
  ];
  decisions.forEach(d => lines.push(renderDecisionBlock(d)));
  return lines.join('\n');
}

function genDecisionPackage(register: DecisionRegister): string {
  const { summary } = register;
  const lines: string[] = [
    `# Fase ${register.phase} — Pacote de Decisões Pendentes`,
    '',
    `Blueprint: \`${register.blueprint_version}\` | Status: \`${register.status}\``,
    '',
    '## Resumo',
    '',
    `- ${summary.by_responsible.ACCOUNTANT} decisões contábeis;`,
    `- ${summary.by_responsible.LEGAL} decisões jurídicas;`,
    `- ${summary.by_responsible.ADMIN} decisões administrativas;`,
    `- ${summary.total_decisions} decisões no total.`,
    '',
    '## Progresso',
    '',
    `- **Decididas:** ${summary.by_status.decided}`,
    `- **Abertas:** ${summary.by_status.open}`,
    '',
    `Próximo passo: ${register.decision_progress.next_step}`,
    '',
    '## Arquivos',
    '',
    '- `phase-3c-2d-2b-accountant-questions.md`',
    '- `phase-3c-2d-2b-legal-questions.md`',
    '- `phase-3c-2d-2b-admin-questions.md`',
    '- `phase-3c-2d-2b-admin-decision.md`',
    '- `phase-3c-2d-2b-bonus-policy.md`',
    '- `phase-3c-2d-2b-decision-register.json`',
    '',
    '## Regra de aprovação',
    '',
    'Um item somente poderá mudar para `READY_FOR_TECHNICAL_CREATION` quando:',
    '',
    '1. houver resposta do responsável;',
    '2. houver justificativa registrada;',
    '3. as mudanças de nome, tipo e tratamento estiverem explícitas;',
    '4. a evidência estiver identificada;',
    '5. uma nova versão do blueprint for preparada e validada.',
    '',
    'Nenhuma resposta deste pacote altera o banco automaticamente.',
    '',
  ];
  return lines.join('\n');
}

function genBonusPolicy(register: DecisionRegister): string {
  const policy = register.business_policies.bonus;
  const statusLabel = policy.status_description
    || policy.status
    || (policy.frozen ? 'CONGELADA para esta implementação' : 'DRAFT');
  const lines: string[] = [
    `# Fase ${register.phase} — Política Oficial do Bônus KAVIAR`,
    '',
    `**Política:** \`${policy.policy_id}\`<br>`,
    `**Aprovado por:** ${policy.approved_by}<br>`,
    `**Data de aprovação:** ${policy.approved_at}<br>`,
    `**Status:** ${statusLabel}`,
    '',
    policy.summary,
    '',
    '## Regras',
    '',
  ];
  policy.rules.forEach(r => {
    lines.push(`### ${r.id}`);
    lines.push('');
    lines.push(escMd(r.description));
    if (r.example) {
      lines.push('');
      lines.push(`> **Exemplo:** ${escMd(r.example)}`);
    }
    lines.push('');
  });
  lines.push('## Lançamentos contábeis conceituais');
  lines.push('');
  lines.push('| Evento | Débito | Crédito |');
  lines.push('|--------|--------|---------|');
  policy.conceptual_journal_entries.forEach(je => {
    lines.push(`| ${escMd(je.event)} | ${escMd(je.debit)} | ${escMd(je.credit)} |`);
  });
  lines.push('');
  lines.push('> Estes lançamentos são conceituais. O tratamento contábil definitivo depende de validação do contador.');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(register: DecisionRegister): void {
  const decisions = register.decisions;
  const total = decisions.length;
  if (total !== 25) {
    throw new Error(`[VALIDATION] Expected exactly 25 decisions, found ${total}.`);
  }

  const byResp: Record<string, number> = {};
  decisions.forEach(d => { byResp[d.responsible] = (byResp[d.responsible] ?? 0) + 1; });
  if ((byResp['ACCOUNTANT'] ?? 0) !== 15) throw new Error(`[VALIDATION] Expected 15 ACCOUNTANT decisions, found ${byResp['ACCOUNTANT'] ?? 0}.`);
  if ((byResp['LEGAL'] ?? 0) !== 4) throw new Error(`[VALIDATION] Expected 4 LEGAL decisions, found ${byResp['LEGAL'] ?? 0}.`);
  if ((byResp['ADMIN'] ?? 0) !== 6) throw new Error(`[VALIDATION] Expected 6 ADMIN decisions, found ${byResp['ADMIN'] ?? 0}.`);

  const decided = decisions.filter(d => d.answer !== null).length;
  const open = decisions.filter(d => d.answer === null).length;
  if (decided !== 6) throw new Error(`[VALIDATION] Expected 6 decided, found ${decided}.`);
  if (open !== 19) throw new Error(`[VALIDATION] Expected 19 open, found ${open}.`);

  const codes = decisions.map(d => d.code);
  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) {
    const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
    throw new Error(`[VALIDATION] Duplicate codes found: ${duplicates.join(', ')}.`);
  }

  const ids = decisions.map(d => d.decision_id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    throw new Error(`[VALIDATION] Duplicate decision_ids found: ${duplicates.join(', ')}.`);
  }

  console.log(`[VALIDATION] OK — ${total} decisions, ${decided} decided, ${open} open, no duplicates.`);
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

function writeIfChanged(filePath: string, content: string, dryRun: boolean): boolean {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing === content) {
    console.log(`[SKIP] ${path.basename(filePath)} — already up to date.`);
    return false;
  }
  if (dryRun) {
    console.log(`[DRY-RUN] Would write ${path.basename(filePath)} (${content.length} chars).`);
    return true;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[WRITE] ${path.basename(filePath)} — ${content.length} chars.`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const outDirIdx = args.indexOf('--out-dir');
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.resolve(scriptDir, '..', '..', '..');
  const docsDir = outDirIdx !== -1 ? path.resolve(args[outDirIdx + 1]) : path.join(repoRoot, 'docs', 'finance');
  const jsonPath = path.join(docsDir, 'phase-3c-2d-2b-decision-register.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`[ERROR] decision-register.json not found at: ${jsonPath}`);
    process.exit(1);
  }

  const register: DecisionRegister = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  validate(register);

  const files: Array<[string, string]> = [
    ['phase-3c-2d-2b-accountant-questions.md', genAccountantQuestions(register)],
    ['phase-3c-2d-2b-legal-questions.md', genLegalQuestions(register)],
    ['phase-3c-2d-2b-admin-questions.md', genAdminQuestions(register)],
    ['phase-3c-2d-2b-admin-decision.md', genAdminDecision(register)],
    ['phase-3c-2d-2b-decision-package.md', genDecisionPackage(register)],
    ['phase-3c-2d-2b-bonus-policy.md', genBonusPolicy(register)],
  ];

  let changed = 0;
  for (const [name, content] of files) {
    const wrote = writeIfChanged(path.join(docsDir, name), content, dryRun);
    if (wrote) changed++;
  }

  if (dryRun) {
    console.log(`[DRY-RUN] ${changed} file(s) would be written.`);
  } else {
    console.log(`[DONE] ${changed} file(s) written, ${files.length - changed} unchanged.`);
  }
}

main();
