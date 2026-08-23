import { describe, expect, it } from 'vitest';

import {
  detectOperationalFindings,
  formatOperationalFindings,
} from '../src/services/ai/kaviar-ai.inconsistency-detector';

import type { DailyBriefingData } from '../src/services/ai/kaviar-ai.tools';

function briefing(
  overrides: Partial<DailyBriefingData> = {}
): DailyBriefingData {
  return {
    referenceTime: '2026-08-23 20:00',
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
    normalItems: [],
    unavailableItems: [],
    ...overrides,
  };
}

describe('Detector de Inconsistências v1', () => {
  it('detecta obrigação financeira vencida como risco alto', () => {
    const findings = detectOperationalFindings(
      briefing({
        finance: {
          ...briefing().finance,
          overdueCount: 2,
        },
      })
    );

    expect(findings[0].code).toBe('FINANCE_OVERDUE');
    expect(findings[0].severity).toBe('HIGH');
  });

  it('detecta corrida com ajuste pendente como inconsistência', () => {
    const findings = detectOperationalFindings(
      briefing({
        rides: {
          ...briefing().rides,
          pendingAdjustment: 3,
        },
      })
    );

    expect(
      findings.some(f => f.code === 'RIDES_PENDING_ADJUSTMENT')
    ).toBe(true);
  });

  it('detecta território sem gestor', () => {
    const findings = detectOperationalFindings(
      briefing({
        territories: {
          ...briefing().territories,
          withoutManagerCount: 2,
        },
      })
    );

    expect(
      findings.some(f => f.code === 'TERRITORIES_WITHOUT_MANAGER')
    ).toBe(true);
  });

  it('não inventa achados quando tudo está normal', () => {
    expect(
      detectOperationalFindings(briefing())
    ).toHaveLength(0);
  });

  it('trata fonte indisponível como lacuna de dados', () => {
    const findings = detectOperationalFindings(
      briefing({
        unavailableItems: ['Financeiro: fonte indisponível.'],
      })
    );

    expect(findings[0].type).toBe('DATA_GAP');
  });

  it('formata evidência, impacto e ação recomendada', () => {
    const answer = formatOperationalFindings(
      detectOperationalFindings(
        briefing({
          drivers: {
            ...briefing().drivers,
            docsPending: 5,
          },
        })
      )
    );

    expect(answer).toContain('Evidência:');
    expect(answer).toContain('Impacto:');
    expect(answer).toContain('Ação recomendada:');
  });
});

describe('Detector v1 — classificação de pergunta', () => {
  it('reconhece pedido de inconsistências', async () => {
    const { isInconsistencyQuestion } = await import(
      '../src/services/ai/kaviar-ai.inconsistency-detector'
    );

    expect(
      isInconsistencyQuestion('Encontre inconsistências no sistema')
    ).toBe(true);
  });

  it('não captura resumo normal do dia', async () => {
    const { isInconsistencyQuestion } = await import(
      '../src/services/ai/kaviar-ai.inconsistency-detector'
    );

    expect(
      isInconsistencyQuestion('Resumo do dia')
    ).toBe(false);
  });
});
