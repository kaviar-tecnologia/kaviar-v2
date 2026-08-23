import type { DailyBriefingData } from './kaviar-ai.tools';

export type SupervisorIntent =
  | 'SUPERVISOR_ACTIONS'
  | 'SUPERVISOR_OVERVIEW';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function classifySupervisorIntent(question: string): SupervisorIntent {
  const q = normalize(question);

  if (
    q.includes('o que precisa da minha atencao') ||
    q.includes('o que devo fazer') ||
    q.includes('o que fazer') ||
    q.includes('por onde comeco') ||
    q.includes('por onde comecar') ||
    q.includes('qual a prioridade') ||
    q.includes('quais as prioridades') ||
    q.includes('o que resolver primeiro') ||
    q.includes('resolver primeiro') ||
    q.includes('mais urgente') ||
    q.includes('prioridade agora')
  ) {
    return 'SUPERVISOR_ACTIONS';
  }

  return 'SUPERVISOR_OVERVIEW';
}


function recommendAction(item: string): string {
  const q = item
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (q.includes('financeir') || q.includes('obrigacao') || q.includes('pagar')) {
    return 'Revisar a pendência financeira e confirmar pagamento ou regularização.';
  }

  if (q.includes('e-mail') || q.includes('email')) {
    return 'Abrir os e-mails sinalizados, validar o risco e decidir o tratamento.';
  }

  if (q.includes('document')) {
    return 'Revisar os documentos pendentes e cobrar ou validar o que estiver faltando.';
  }

  if (q.includes('aguardando aprovacao')) {
    return 'Revisar os cadastros pendentes e aprovar ou rejeitar os casos válidos.';
  }

  if (q.includes('compliance')) {
    return 'Revisar as pendências de compliance antes de liberar a operação.';
  }

  if (q.includes('lead')) {
    return 'Priorizar contato com os leads pendentes, começando pelos mais antigos.';
  }

  if (q.includes('territor')) {
    return 'Revisar o território pendente e identificar o bloqueio para ativação.';
  }

  if (q.includes('corrida')) {
    return 'Revisar a ocorrência operacional e tratar o ajuste pendente.';
  }

  return 'Revisar esta pendência e definir o próximo responsável ou ação.';
}

export function formatSupervisorActions(data: DailyBriefingData): string {
  const actions: string[] = [];

  for (const item of data.highItems) {
    actions.push(item);
  }

  for (const item of data.attentionItems) {
    actions.push(item);
  }

  const top = actions.slice(0, 5);

  const parts: string[] = [
    `Prioridade geral: ${data.priority}.`,
  ];

  if (top.length === 0) {
    if (data.unavailableItems.length > 0) {
      parts.push(
        'Não há pendências operacionais identificadas, mas existem fontes que não puderam ser consultadas.'
      );
    } else {
      parts.push(
        'Não há pendências prioritárias identificadas neste momento.'
      );
    }
  } else {
    parts.push('O que resolver primeiro:');

    top.forEach((item, index) => {
      parts.push(`${index + 1}. ${item}`);
      parts.push(`   Ação recomendada: ${recommendAction(item)}`);
    });

    parts.push(
      'Posso ajudar a detalhar ou executar alguma dessas ações, mediante sua confirmação.'
    );
  }

  if (data.unavailableItems.length > 0) {
    const sourceLabel =
      data.unavailableItems.length === 1
        ? 'fonte indisponível'
        : 'fontes indisponíveis';

    parts.push(
      `Atenção: ${data.unavailableItems.length} ${sourceLabel} na consulta.`
    );
  }

  return parts.join('\n');
}
