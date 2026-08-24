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

  const isEmail =
    q.includes('email') ||
    q.includes('e-mail') ||
    q.includes('inbox') ||
    q.includes('caixa de entrada');

  const asksEmailList =
    q.includes('assunto') ||
    q.includes('assuntos') ||
    q.includes('tema') ||
    q.includes('temas') ||
    q.includes('sobre o que') ||
    q.includes('me mostre') ||
    q.includes('mostre os') ||
    q.includes('quais email') ||
    q.includes('quais e-mail') ||
    q.includes('quais novos email') ||
    q.includes('quais novos e-mail') ||
    q.includes('que email') ||
    q.includes('que e-mail') ||
    q.includes('que novos email') ||
    q.includes('que novos e-mail') ||
    q.includes('o que chegou') ||
    q.includes('quais chegaram');

  const asksEmailCount =
    q.includes('quantos') ||
    q.includes('quantas') ||
    q.includes('quantidade');

  if (isEmail && asksEmailList && !asksEmailCount) {
    return 'COMM_EMAIL_SUBJECTS';
  }

  if (isEmail) {
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

export function formatEmailImportant(data: InboxSummaryData): string {
  if (data.recent.length === 0) {
    return 'Não há e-mails novos recentes para fazer uma triagem.';
  }

  const attentionTerms = [
    'pagamento',
    'cobranca',
    'cobrança',
    'vencimento',
    'vencido',
    'falha',
    'falhou',
    'nao foi bem-sucedido',
    'não foi bem-sucedido',
    'aprovado',
    'aprovada',
    'reprovado',
    'reprovada',
    'bloqueio',
    'bloqueado',
    'bloqueada',
    'suspensao',
    'suspensão',
    'cancelamento',
    'cancelado',
    'cancelada',
    'acao necessaria',
    'ação necessária',
    'urgente',
    'prefeitura',
    'municipio',
    'município',
    'secretaria',
    'smtr',
    'emdec',
    'cadastro',
    'plataforma',
    'autorizacao',
    'autorização',
    'protocolo',
    'regulatorio',
    'regulatório',
  ];

  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const attention = data.recent.filter(item => {
    // Segurança e prioridade de negócio são conceitos diferentes:
    // HIGH entra automaticamente; MEDIUM precisa também de sinal operacional.
    if (item.riskLevel === 'HIGH') return true;

    const subject = normalize(item.subject);

    const isReply =
      /^re\s*:/i.test(item.subject.trim()) ||
      /^res\s*:/i.test(item.subject.trim()) ||
      /^fwd\s*:/i.test(item.subject.trim()) ||
      /^enc\s*:/i.test(item.subject.trim());

    if (isReply) return true;

    return attentionTerms.some(term =>
      subject.includes(normalize(term))
    );
  });

  if (attention.length === 0) {
    return [
      'Não existe uma marcação formal de e-mail importante no KAVIAR.',
      'Entre os e-mails recentes analisados, nenhum apresentou sinal objetivo de prioridade operacional ou risco.',
    ].join('\n');
  }

  const classify = (item: InboxSummaryData['recent'][number]) => {
    const subject = normalize(item.subject);

    if (
      subject.includes('prefeitura') ||
      subject.includes('municipio') ||
      subject.includes('secretaria') ||
      subject.includes('ouvidoria') ||
      subject.includes('smtr') ||
      subject.includes('emdec') ||
      subject.includes('regulament') ||
      subject.includes('cadastro da plataforma') ||
      subject.includes('cadastramento') ||
      subject.includes('autorizacao') ||
      subject.includes('protocolo')
    ) return 'Regulatório';

    if (
      subject.includes('pagamento') ||
      subject.includes('cobranca') ||
      subject.includes('honorarios') ||
      subject.includes('pix') ||
      subject.includes('cartao') ||
      subject.includes('vencimento')
    ) return 'Financeiro';

    if (
      subject.includes('bloqueio') ||
      subject.includes('bloquead') ||
      subject.includes('suspens')
    ) return 'Conta e serviços';

    if (item.riskLevel === 'HIGH') return 'Segurança';

    return 'Outros';
  };

  const visible = attention.slice(0, 10);
  const hiddenCount = attention.length - visible.length;
  const order = ['Regulatório', 'Financeiro', 'Conta e serviços', 'Segurança', 'Outros'];

  const lines: string[] = [
    'Não existe uma marcação formal de e-mail importante no KAVIAR.',
    'Mas estes e-mails merecem atenção:',
  ];

  for (const category of order) {
    const items = visible.filter(item => classify(item) === category);
    if (items.length === 0) continue;

    lines.push('', `${category}:`);

    for (const item of items) {
      const rawSender = item.fromName?.trim() || '';
      const normalizedSender = rawSender.toLowerCase();

      const technicalSender =
        normalizedSender.startsWith('bounce') ||
        normalizedSender.startsWith('return') ||
        normalizedSender === 'reminders' ||
        normalizedSender === 'donotreply' ||
        normalizedSender === 'do-not-reply' ||
        normalizedSender === 'noreply' ||
        /^[0-9a-f-]{20,}$/i.test(rawSender);

      const senderPart =
        rawSender && !technicalSender
          ? ` — ${rawSender}`
          : '';

      const riskPart =
        item.riskLevel === 'HIGH'
          ? ' — risco HIGH'
          : '';

      const linkPart =
        item.id
          ? ` — [Abrir e-mail](/admin/inbox?message=${encodeURIComponent(item.id)})`
          : '';

      lines.push(`• ${item.subject}${senderPart}${riskPart}${linkPart}`);
    }
  }

  if (hiddenCount > 0) {
    lines.push(
      '',
      `• ... e mais ${hiddenCount} e-mail${hiddenCount === 1 ? '' : 's'} relevante${hiddenCount === 1 ? '' : 's'} não exibido${hiddenCount === 1 ? '' : 's'}.`
    );
  }

  return lines.join('\n');
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
