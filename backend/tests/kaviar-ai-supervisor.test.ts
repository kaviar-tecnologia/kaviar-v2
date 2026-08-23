import { describe, expect, it } from 'vitest';

import {
  classifySupervisorIntent,
  formatSupervisorActions,
} from '../src/services/ai/kaviar-ai.supervisor';

import type { DailyBriefingData } from '../src/services/ai/kaviar-ai.tools';

function briefing(
  overrides: Partial<DailyBriefingData> = {}
): DailyBriefingData {
  return {
    referenceTime: '2026-08-23 19:30',
    priority: 'NORMAL',
    rides: {
      available: true,
      completed: 0,
      grossAmount: '0',
      kaviarFee: '0',
      canceled: 0,
      noDriver: 0,
      pendingAdjustment: 0,
    },
    drivers: {
      available: true,
      docsPending: 0,
      pendingApproval: 0,
      compliancePending: 0,
    },
    finance: {
      available: true,
      overdueCount: 0,
      overdueAmountCents: '0',
      due7dCount: 0,
      due7dAmountCents: '0',
      due15dCount: 0,
      due15dAmountCents: '0',
      due30dCount: 0,
      due30dAmountCents: '0',
      uncategorizedAvailable: true,
      uncategorizedTransactions: 0,
    },
    leads: {
      available: true,
      newToday: 0,
      noContact: 0,
      stale3d: 0,
    },
    inbox: {
      available: true,
      newCount: 0,
      highRiskRecentCount: 0,
      riskAssessedLimit: 20,
      latestSubjects: [],
    },
    territories: {
      available: true,
      preparationCount: 0,
      withoutManagerCount: 0,
    },
    highItems: [],
    attentionItems: [],
    normalItems: ['Operação sem pendências prioritárias.'],
    unavailableItems: [],
    ...overrides,
  };
}

describe('Supervisor v1', () => {
  it('detects action-oriented question', () => {
    expect(
      classifySupervisorIntent('O que precisa da minha atenção hoje?')
    ).toBe('SUPERVISOR_ACTIONS');
  });

  it('detects priority question', () => {
    expect(
      classifySupervisorIntent('Qual a prioridade agora?')
    ).toBe('SUPERVISOR_ACTIONS');
  });

  it('keeps ordinary daily summary as overview', () => {
    expect(
      classifySupervisorIntent('Resumo do dia')
    ).toBe('SUPERVISOR_OVERVIEW');
  });

  it('puts high priority before attention items', () => {
    const answer = formatSupervisorActions(
      briefing({
        priority: 'ALTA',
        highItems: [
          '2 obrigações financeiras vencidas.',
          '1 corrida com ajuste pendente.',
        ],
        attentionItems: [
          '3 motoristas com documentos pendentes.',
        ],
      })
    );

    expect(answer).toContain('Prioridade geral: ALTA.');
    expect(answer.indexOf('obrigações')).toBeLessThan(
      answer.indexOf('motoristas')
    );
    expect(answer).toContain('1. 2 obrigações');
    expect(answer).toContain('3. 3 motoristas');
  });

  it('limits action list to five items', () => {
    const answer = formatSupervisorActions(
      briefing({
        priority: 'ALTA',
        highItems: ['A', 'B', 'C'],
        attentionItems: ['D', 'E', 'F'],
      })
    );

    expect(answer).toContain('5. E');
    expect(answer).not.toContain('6. F');
  });

  it('reports no priority when everything is normal', () => {
    const answer = formatSupervisorActions(briefing());

    expect(answer).toContain(
      'Não há pendências prioritárias identificadas neste momento.'
    );
  });

  it('warns when sources are unavailable', () => {
    const answer = formatSupervisorActions(
      briefing({
        priority: 'INDISPONÍVEL',
        unavailableItems: [
          'Inbox: fonte indisponível.',
          'Financeiro: fonte indisponível.',
        ],
      })
    );

    expect(answer).toContain('2 fontes indisponíveis');
  });
});

describe('Supervisor v1 — routing contract', () => {
  it('action question is explicitly classified for daily briefing supervision', () => {
    expect(
      classifySupervisorIntent('O que devo resolver primeiro?')
    ).toBe('SUPERVISOR_ACTIONS');
  });

  it('daily summary remains overview and is not converted into action ranking', () => {
    expect(
      classifySupervisorIntent('Resumo do dia')
    ).toBe('SUPERVISOR_OVERVIEW');
  });
});
