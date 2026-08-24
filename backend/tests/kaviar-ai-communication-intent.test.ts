import { describe, expect, it } from 'vitest';

import {
  classifyCommunicationIntent,
  formatEmailNew,
  formatEmailImportant,
  formatEmailSubjects,
  formatEmailRisk,
  formatWhatsAppUnread,
  formatWhatsAppUrgent,
  formatWhatsAppNew,
} from '../src/services/ai/kaviar-ai.communication-intent';

import type { InboxSummaryData } from '../src/services/ai/kaviar-ai.tools';
import type { WhatsAppSummaryData } from '../src/services/ai/kaviar-ai.command-center';

const INBOX: InboxSummaryData = {
  totalNew: 3,
  recent: [
    {
      subject: 'AWS Health Event',
      fromName: 'AWS',
      receivedAt: '2026-08-23 18:00',
      hasAttachments: false,
      riskLevel: 'LOW',
    },
    {
      subject: 'Mensagem suspeita',
      fromName: 'Unknown',
      receivedAt: '2026-08-23 17:00',
      hasAttachments: true,
      riskLevel: 'HIGH',
    },
  ],
};

const WHATSAPP: WhatsAppSummaryData = {
  available: true,
  referenceTime: '2026-08-23 19:00',
  unreadMessages: 5,
  conversationsWithUnread: 2,
  newConversations: 3,
  inProgressConversations: 4,
  highPriorityConversations: 1,
  recentConversations: [],
};

describe('COMMUNICATION semantic intent', () => {
  it('classifies new email questions', () => {
    expect(
      classifyCommunicationIntent('Tem e-mails novos?')
    ).toBe('COMM_EMAIL_NEW');
  });

  it('classifies email subject questions', () => {
    expect(
      classifyCommunicationIntent('Quais os assuntos dos e-mails que chegaram?')
    ).toBe('COMM_EMAIL_SUBJECTS');
  });

  it('understands natural requests to show new emails', () => {
    expect(
      classifyCommunicationIntent('me mostre os novos e-mails')
    ).toBe('COMM_EMAIL_SUBJECTS');

    expect(
      classifyCommunicationIntent('quais e-mails novos temos?')
    ).toBe('COMM_EMAIL_SUBJECTS');

    expect(
      classifyCommunicationIntent('que novos emails temos')
    ).toBe('COMM_EMAIL_SUBJECTS');

    expect(
      classifyCommunicationIntent('o que chegou no e-mail?')
    ).toBe('COMM_EMAIL_SUBJECTS');
  });

  it('keeps explicit email count questions as count', () => {
    expect(
      classifyCommunicationIntent('quantos e-mails novos temos?')
    ).toBe('COMM_EMAIL_NEW');
  });

  it('classifies email risk questions', () => {
    expect(
      classifyCommunicationIntent('Tem algum e-mail suspeito?')
    ).toBe('COMM_EMAIL_RISK');
  });

  it('classifies important email without pretending it is security risk', () => {
    expect(
      classifyCommunicationIntent('Tem algum e-mail importante?')
    ).toBe('COMM_EMAIL_IMPORTANT');

    expect(formatEmailImportant()).toContain('não possui um critério confiável');
  });

  it('keeps general WhatsApp questions on the WhatsApp channel', () => {
    expect(
      classifyCommunicationIntent('Como está o WhatsApp?')
    ).toBe('COMM_WHATSAPP_GENERAL');
  });

  it('classifies unread WhatsApp questions', () => {
    expect(
      classifyCommunicationIntent('Tem mensagem não lida no WhatsApp?')
    ).toBe('COMM_WHATSAPP_UNREAD');
  });

  it('classifies urgent WhatsApp questions', () => {
    expect(
      classifyCommunicationIntent('Tem conversa urgente no WhatsApp?')
    ).toBe('COMM_WHATSAPP_URGENT');
  });

  it('classifies new WhatsApp conversations', () => {
    expect(
      classifyCommunicationIntent('Tem novas conversas no WhatsApp?')
    ).toBe('COMM_WHATSAPP_NEW');
  });

  it('formats only new email count', () => {
    const answer = formatEmailNew(INBOX);

    expect(answer).toContain('3');
    expect(answer).not.toContain('AWS Health Event');
    expect(answer).not.toContain('HIGH');
  });

  it('formats only email subjects', () => {
    const answer = formatEmailSubjects(INBOX);

    expect(answer).toContain('AWS Health Event');
    expect(answer).toContain('Mensagem suspeita');
    expect(answer).not.toContain('risco HIGH');
  });

  it('formats only risky emails', () => {
    const answer = formatEmailRisk(INBOX);

    expect(answer).toContain('Mensagem suspeita');
    expect(answer).toContain('HIGH');
    expect(answer).not.toContain('AWS Health Event');
  });

  it('formats unread WhatsApp only', () => {
    const answer = formatWhatsAppUnread(WHATSAPP);

    expect(answer).toContain('5 mensagens não lidas');
    expect(answer).toContain('2 conversas');
    expect(answer).not.toContain('urgente');
  });

  it('formats urgent WhatsApp only', () => {
    const answer = formatWhatsAppUrgent(WHATSAPP);

    expect(answer).toContain('1 conversa');
    expect(answer).toContain('urgente');
    expect(answer).not.toContain('5 mensagem');
  });

  it('formats new WhatsApp conversations only', () => {
    const answer = formatWhatsAppNew(WHATSAPP);

    expect(answer).toContain('3 conversa');
    expect(answer).toContain('nova');
    expect(answer).not.toContain('5 mensagem');
  });
});
