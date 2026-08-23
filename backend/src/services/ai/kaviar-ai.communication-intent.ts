import type { InboxSummaryData } from './kaviar-ai.tools';
import type { WhatsAppSummaryData } from './kaviar-ai.command-center';

export type CommunicationSubIntent =
  | 'COMM_EMAIL_NEW'
  | 'COMM_EMAIL_SUBJECTS'
  | 'COMM_EMAIL_RISK'
  | 'COMM_EMAIL_IMPORTANT'
  | 'COMM_WHATSAPP_UNREAD'
  | 'COMM_WHATSAPP_URGENT'
  | 'COMM_WHATSAPP_NEW'
  | 'COMM_WHATSAPP_GENERAL'
  | 'COMM_GENERAL';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function classifyCommunicationIntent(
  question: string
): CommunicationSubIntent {
  const q = normalize(question);

  const isWhatsApp =
    q.includes('whatsapp') ||
    q.includes('zap');

  if (isWhatsApp) {
    if (
      q.includes('urgente') ||
      q.includes('urgentes') ||
      q.includes('prioridade alta') ||
      q.includes('alta prioridade')
    ) {
      return 'COMM_WHATSAPP_URGENT';
    }

    if (
      q.includes('nao lida') ||
      q.includes('nao lidas') ||
      q.includes('nao lido') ||
      q.includes('nao lidos') ||
      q.includes('pendente')
    ) {
      return 'COMM_WHATSAPP_UNREAD';
    }

    if (
      q.includes('nova conversa') ||
      q.includes('novas conversas') ||
      q.includes('conversa nova')
    ) {
      return 'COMM_WHATSAPP_NEW';
    }

    return 'COMM_WHATSAPP_GENERAL';
  }

  if (
    q.includes('risco') ||
    q.includes('suspeito') ||
    q.includes('suspeitos') ||
    q.includes('perigoso') ||
    q.includes('phishing')
  ) {
    return 'COMM_EMAIL_RISK';
  }

  if (
    q.includes('importante') ||
    q.includes('importantes') ||
    q.includes('prioritario') ||
    q.includes('prioritarios')
  ) {
    return 'COMM_EMAIL_IMPORTANT';
  }

  if (
    q.includes('assunto') ||
    q.includes('assuntos') ||
    q.includes('tema') ||
    q.includes('temas') ||
    q.includes('sobre o que')
  ) {
    return 'COMM_EMAIL_SUBJECTS';
  }

  if (
    q.includes('email') ||
    q.includes('e-mail') ||
    q.includes('inbox') ||
    q.includes('caixa de entrada')
  ) {
    return 'COMM_EMAIL_NEW';
  }

  return 'COMM_GENERAL';
}

export function formatEmailNew(data: InboxSummaryData): string {
  if (data.totalNew === 0) {
    return 'Não há e-mails novos na caixa de entrada.';
  }

  return `Há ${data.totalNew} e-mail${data.totalNew === 1 ? '' : 's'} novo${data.totalNew === 1 ? '' : 's'} na caixa de entrada.`;
}

export function formatEmailImportant(): string {
  return 'A caixa de entrada não possui um critério confiável de importância. Posso mostrar os assuntos dos e-mails novos ou verificar mensagens com risco de segurança.';
}

export function formatEmailSubjects(data: InboxSummaryData): string {
  if (data.recent.length === 0) {
    return 'Não há e-mails novos com assuntos para listar.';
  }

  return [
    'Assuntos dos e-mails novos:',
    ...data.recent.map(item => `• ${item.subject}`),
  ].join('\n');
}

export function formatEmailRisk(data: InboxSummaryData): string {
  const risky = data.recent.filter(item => item.riskLevel !== 'LOW');

  if (risky.length === 0) {
    return 'Não encontrei e-mails novos com risco elevado entre os e-mails recentes analisados.';
  }

  return [
    `Há ${risky.length} e-mail${risky.length === 1 ? '' : 's'} recente${risky.length === 1 ? '' : 's'} com risco acima de LOW:`,
    ...risky.map(item => `• ${item.subject} — risco ${item.riskLevel}`),
  ].join('\n');
}

export function formatWhatsAppUnread(data: WhatsAppSummaryData): string {
  if (!data.available) {
    return 'Central WhatsApp: não foi possível consultar.';
  }

  if (data.unreadMessages === 0) {
    return 'Não há mensagens não lidas no WhatsApp.';
  }

  return `Há ${data.unreadMessages} ${data.unreadMessages === 1 ? 'mensagem não lida' : 'mensagens não lidas'} em ${data.conversationsWithUnread} conversa${data.conversationsWithUnread === 1 ? '' : 's'}.`;
}

export function formatWhatsAppUrgent(data: WhatsAppSummaryData): string {
  if (!data.available) {
    return 'Central WhatsApp: não foi possível consultar.';
  }

  if (data.highPriorityConversations === 0) {
    return 'Não há conversas urgentes no WhatsApp.';
  }

  return `Há ${data.highPriorityConversations} conversa${data.highPriorityConversations === 1 ? '' : 's'} urgente${data.highPriorityConversations === 1 ? '' : 's'} no WhatsApp.`;
}

export function formatWhatsAppNew(data: WhatsAppSummaryData): string {
  if (!data.available) {
    return 'Central WhatsApp: não foi possível consultar.';
  }

  if (data.newConversations === 0) {
    return 'Não há conversas novas no WhatsApp.';
  }

  return `Há ${data.newConversations} conversa${data.newConversations === 1 ? '' : 's'} nova${data.newConversations === 1 ? '' : 's'} no WhatsApp.`;
}
