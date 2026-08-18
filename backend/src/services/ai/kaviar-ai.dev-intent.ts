import type {
  DevelopmentIntentCategory,
  DevelopmentProposal,
} from './kaviar-ai.types';

export type DevelopmentIntentResult =
  | {
      isDevIntent: true;
      category: DevelopmentIntentCategory;
      summary: string;
      proposal: DevelopmentProposal;
    }
  | {
      isDevIntent: false;
    };

/**
 * Normaliza o texto removendo acentos, convertendo para minúsculas e removendo espaços extras.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Gera uma proposta segura de Development Job sem persistência ou execução.
 */
export function generateDevelopmentProposal(
  category: DevelopmentIntentCategory,
  question: string
): DevelopmentProposal {
  return {
    category,
    summary: question.trim(),
    status: 'AWAITING_CONFIRMATION',
    requiresHumanConfirmation: true,
    canMerge: false,
    canDeployProduction: false,
    canAccessProductionDatabase: false,
  };
}

/**
 * Detecta e classifica intenções explícitas de desenvolvimento de software.
 *
 * Módulo puro e determinístico para diferenciar solicitações de código/software
 * de tarefas administrativas/operacionais do KAVIAR.
 */
export function detectDevelopmentIntent(question: string): DevelopmentIntentResult {
  if (!question || typeof question !== 'string') {
    return { isDevIntent: false };
  }

  const normalized = normalizeText(question);

  // 1. Refatoração (REFACTOR)
  if (
    normalized.includes('refatorar') ||
    normalized.includes('refactor') ||
    normalized.includes('refatoracao') ||
    normalized.includes('clean code')
  ) {
    const category: DevelopmentIntentCategory = 'REFACTOR';
    return {
      isDevIntent: true,
      category,
      summary: question.trim(),
      proposal: generateDevelopmentProposal(category, question),
    };
  }

  // 2. Correção de Bug Técnico (BUG_FIX)
  const isBugExplicit =
    normalized.includes('bug') &&
    (normalized.includes('corrigir') ||
      normalized.includes('fix') ||
      normalized.includes('resolver') ||
      normalized.includes('consertar') ||
      normalized.includes('investigar') ||
      normalized.includes('analisar'));

  const isTechnicalErrorFix =
    normalized.includes('fix no backend') ||
    normalized.includes('fix no frontend') ||
    normalized.includes('corrigir erro no backend') ||
    normalized.includes('corrigir erro no frontend') ||
    normalized.includes('corrigir erro no codigo') ||
    normalized.includes('corrigir erro de codigo');

  if (isBugExplicit || isTechnicalErrorFix) {
    const category: DevelopmentIntentCategory = 'BUG_FIX';
    return {
      isDevIntent: true,
      category,
      summary: question.trim(),
      proposal: generateDevelopmentProposal(category, question),
    };
  }

  // 3. Novas funcionalidades, endpoints e testes (FEATURE)
  const isFeatureExplicit =
    normalized.includes('feature') &&
    (normalized.includes('implementar') ||
      normalized.includes('criar') ||
      normalized.includes('adicionar') ||
      normalized.includes('desenvolver'));

  const isEndpointExplicit =
    normalized.includes('endpoint') &&
    (normalized.includes('criar') ||
      normalized.includes('implementar') ||
      normalized.includes('adicionar') ||
      normalized.includes('alterar'));

  const mentionsExplicitTest =
    normalized.includes('teste unitario') ||
    normalized.includes('testes unitarios') ||
    normalized.includes('teste de integracao') ||
    normalized.includes('testes de integracao');

  const isUnitTestExplicit =
    mentionsExplicitTest &&
    (normalized.includes('adicionar') ||
      normalized.includes('criar') ||
      normalized.includes('escrever') ||
      normalized.includes('implementar') ||
      normalized.includes('ajustar') ||
      normalized.includes('corrigir') ||
      normalized.includes('alterar'));

  if (isFeatureExplicit || isEndpointExplicit) {
    const category: DevelopmentIntentCategory = 'FEATURE';
    return {
      isDevIntent: true,
      category,
      summary: question.trim(),
      proposal: generateDevelopmentProposal(category, question),
    };
  }

  // 4. Alterações explícitas de código (CODE_CHANGE)
  const isCodeExplicit =
    normalized.includes('codigo') &&
    (normalized.includes('alterar') ||
      normalized.includes('mudar') ||
      normalized.includes('modificar') ||
      normalized.includes('ajustar') ||
      normalized.includes('mexer') ||
      normalized.includes('escrever'));

  const isReactComponentExplicit =
    (normalized.includes('componente react') || normalized.includes('componente de ui')) &&
    (normalized.includes('ajustar') ||
      normalized.includes('alterar') ||
      normalized.includes('mudar') ||
      normalized.includes('criar') ||
      normalized.includes('corrigir'));

  const isBackendFrontendCodeChange =
    (normalized.includes('no backend') ||
      normalized.includes('do backend') ||
      normalized.includes('no frontend') ||
      normalized.includes('do frontend')) &&
    (normalized.includes('alterar') ||
      normalized.includes('modificar') ||
      normalized.includes('ajustar') ||
      normalized.includes('mudar'));

  if (
    isCodeExplicit ||
    isReactComponentExplicit ||
    isBackendFrontendCodeChange ||
    isUnitTestExplicit
  ) {
    const category: DevelopmentIntentCategory = 'CODE_CHANGE';
    return {
      isDevIntent: true,
      category,
      summary: question.trim(),
      proposal: generateDevelopmentProposal(category, question),
    };
  }

  return { isDevIntent: false };
}
