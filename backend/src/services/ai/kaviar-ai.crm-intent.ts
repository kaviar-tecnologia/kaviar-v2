import type { CrmLeadsSummaryData } from './kaviar-ai.tools';

export type CrmSubIntent =
  | 'CRM_NO_CONTACT'
  | 'CRM_NEW'
  | 'CRM_STALE'
  | 'CRM_FUNNEL'
  | 'CRM_SOURCE'
  | 'CRM_TERRITORY'
  | 'CRM_GENERAL';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function classifyCrmIntent(question: string): CrmSubIntent {
  const q = normalize(question);

  if (
    q.includes('sem contato') ||
    q.includes('nao contat') ||
    q.includes('aguardando contato')
  ) {
    return 'CRM_NO_CONTACT';
  }

  if (
    q.includes('novo lead') ||
    q.includes('novos leads') ||
    q.includes('leads novos') ||
    q.includes('entraram hoje') ||
    q.includes('chegaram hoje')
  ) {
    return 'CRM_NEW';
  }

  if (
    q.includes('parado') ||
    q.includes('parados') ||
    q.includes('estagnado') ||
    q.includes('estagnados') ||
    q.includes('mais de 3 dias') ||
    q.includes('3 dias')
  ) {
    return 'CRM_STALE';
  }

  if (
    q.includes('funil') ||
    q.includes('status dos leads') ||
    q.includes('por status') ||
    q.includes('etapa')
  ) {
    return 'CRM_FUNNEL';
  }

  if (
    q.includes('origem') ||
    q.includes('fonte') ||
    q.includes('vieram') ||
    q.includes('veio os leads')
  ) {
    return 'CRM_SOURCE';
  }

  if (
    q.includes('territorio') ||
    q.includes('territorios') ||
    q.includes('cidade') ||
    q.includes('cidades')
  ) {
    return 'CRM_TERRITORY';
  }

  return 'CRM_GENERAL';
}

export function formatCrmIntent(
  subIntent: CrmSubIntent,
  data: CrmLeadsSummaryData
): string {
  switch (subIntent) {
    case 'CRM_NO_CONTACT':
      return data.noContactCount === 0
        ? 'Não há leads sem contato no período.'
        : `Há **${data.noContactCount}** lead${data.noContactCount === 1 ? '' : 's'} sem contato no período.`;

    case 'CRM_NEW':
      return data.newCount === 0
        ? `Não há novos leads em ${data.periodLabel}.`
        : `Há **${data.newCount}** novo${data.newCount === 1 ? ' lead' : 's leads'} em ${data.periodLabel}.`;

    case 'CRM_STALE':
      return data.stale3dCount === 0
        ? 'Não há leads parados há mais de 3 dias.'
        : `Há **${data.stale3dCount}** lead${data.stale3dCount === 1 ? '' : 's'} parado${data.stale3dCount === 1 ? '' : 's'} há mais de 3 dias.`;

    case 'CRM_FUNNEL': {
      const entries = Object.entries(data.byStatus);
      if (entries.length === 0) {
        return 'Não há dados de funil de leads no período.';
      }

      return [
        `Funil de leads — ${data.periodLabel}:`,
        ...entries.map(([status, count]) => `• ${status}: ${count}`),
      ].join('\n');
    }

    case 'CRM_SOURCE': {
      const entries = Object.entries(data.bySource);
      if (entries.length === 0) {
        return 'Não há dados de origem dos leads no período.';
      }

      return [
        `Origem dos leads — ${data.periodLabel}:`,
        ...entries.map(([source, count]) => `• ${source}: ${count}`),
      ].join('\n');
    }

    case 'CRM_TERRITORY':
      if (data.topTerritories.length === 0) {
        return 'Não há dados de leads por território no período.';
      }

      return [
        `Leads por território — ${data.periodLabel}:`,
        ...data.topTerritories.map(item => `• ${item.name}: ${item.count}`),
      ].join('\n');

    case 'CRM_GENERAL':
    default:
      return [
        `CRM Leads — ${data.periodLabel}`,
        `• Novos: ${data.newCount}`,
        `• Sem contato: ${data.noContactCount}`,
        `• Parados há mais de 3 dias: ${data.stale3dCount}`,
      ].join('\n');
  }
}
