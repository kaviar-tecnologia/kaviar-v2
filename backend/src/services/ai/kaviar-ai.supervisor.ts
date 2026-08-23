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
    q.includes('por onde começar') ||
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
    });
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
