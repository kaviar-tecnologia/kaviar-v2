import type { KaviarAiToolName } from './kaviar-ai.types';

/**
 * Tipo de documento solicitado na redação.
 */
export type DraftingDocumentType =
  | 'oficio'
  | 'email'
  | 'comunicado'
  | 'resposta'
  | 'carta'
  | 'notificacao'
  | 'relatorio'
  | 'general';

export type DraftingIntentResult =
  | {
      isDrafting: true;
      documentType: DraftingDocumentType;
      toolsForContext: KaviarAiToolName[];
    }
  | {
      isDrafting: false;
    };

/**
 * Normaliza texto para comparação: remove acentos, lowercase, trim.
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Verbos que indicam intenção de redação/produção textual.
 */
const DRAFTING_VERBS = [
  'preparar', 'prepare',
  'redigir', 'redija',
  'escrever', 'escreva',
  'fazer', 'faca', 'faça',
  'elaborar', 'elabore',
  'compor', 'componha',
  'montar', 'monte',
  'criar', 'crie',
  'gerar', 'gere',
  'produzir', 'produza',
  'rascunhar', 'rascunhe',
];

/**
 * Substantivos que indicam tipo de documento.
 */
const DOCUMENT_NOUNS: Array<{ patterns: string[]; type: DraftingDocumentType }> = [
  { patterns: ['oficio', 'oficios'], type: 'oficio' },
  { patterns: ['e-mail', 'email', 'emails', 'e-mails'], type: 'email' },
  { patterns: ['comunicado', 'comunicados'], type: 'comunicado' },
  { patterns: ['resposta', 'respostas'], type: 'resposta' },
  { patterns: ['carta', 'cartas'], type: 'carta' },
  { patterns: ['notificacao', 'notificacoes', 'notificação', 'notificações'], type: 'notificacao' },
  { patterns: ['relatorio', 'relatorios', 'relatório', 'relatórios'], type: 'relatorio' },
];

/**
 * Palavras que indicam referência a dados KAVIAR (justificam contexto factual).
 */
const KAVIAR_CONTEXT_INDICATORS = [
  'kaviar', 'empresa', 'cnpj', 'institucional', 'razao social',
  'razão social', 'dados da empresa',
];

/**
 * Detecta se a pergunta é um pedido de redação/drafting.
 *
 * Módulo puro e determinístico. Não consulta modelo, banco ou rede.
 * Segue o mesmo padrão de kaviar-ai.dev-intent.ts.
 *
 * Regra: verbo de redação + substantivo de documento = drafting.
 * Se a pergunta contiver apenas o substantivo sem verbo de redação,
 * NÃO dispara drafting (ex: "qual o CNPJ" não é drafting).
 */
export function detectDraftingIntent(question: string): DraftingIntentResult {
  if (!question || typeof question !== 'string') {
    return { isDrafting: false };
  }

  const normalized = normalize(question);

  // Deve conter pelo menos um verbo de redação
  const hasVerb = DRAFTING_VERBS.some((verb) => normalized.includes(verb));
  if (!hasVerb) {
    return { isDrafting: false };
  }

  // Deve conter pelo menos um substantivo de documento
  let documentType: DraftingDocumentType = 'general';
  let foundDocument = false;

  for (const entry of DOCUMENT_NOUNS) {
    const matched = entry.patterns.some((pattern) => {
      const normalizedPattern = normalize(pattern);
      return normalized.includes(normalizedPattern);
    });
    if (matched) {
      documentType = entry.type;
      foundDocument = true;
      break;
    }
  }

  if (!foundDocument) {
    return { isDrafting: false };
  }

  // Determinar quais ferramentas fornecem contexto relevante
  const toolsForContext: KaviarAiToolName[] = [];

  const needsCompanyContext = KAVIAR_CONTEXT_INDICATORS.some((kw) =>
    normalized.includes(normalize(kw))
  );

  if (needsCompanyContext) {
    toolsForContext.push('company_profile');
  }

  return {
    isDrafting: true,
    documentType,
    toolsForContext,
  };
}
