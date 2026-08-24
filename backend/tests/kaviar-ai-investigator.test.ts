import { describe, expect, it } from 'vitest';

import {
  isDriverDocumentsInvestigation,
  formatDriverDocumentsInvestigation,
} from '../src/services/ai/kaviar-ai.investigator';

describe('Investigador v1', () => {
  it('reconhece investigação de documentos de motoristas', () => {
    expect(
      isDriverDocumentsInvestigation(
        'Investigue por que temos 26 motoristas com documentos pendentes.'
      )
    ).toBe(true);
  });

  it('não captura consulta simples de documentos', () => {
    expect(
      isDriverDocumentsInvestigation(
        'Quantos motoristas têm documentos pendentes?'
      )
    ).toBe(false);
  });

  it('identifica gargalo de revisão quando SUBMITTED domina', () => {
    const answer = formatDriverDocumentsInvestigation(
      {
        driversAffected: 26,
        summary: {
          MISSING: 8,
          SUBMITTED: 18,
        },
        compliancePending: 12,
      },
      {
        available: true,
        total: 40,
        byStatus: {},
        byVehicleType: {},
        pendingApproval: 5,
        docsMissing: 8,
        docsSubmitted: 18,
        docsRejected: 0,
        compliancePending: 12,
        activeDrivers: 10,
        suspendedDrivers: 0,
        modalities: {
          available: true,
          pending: 0,
          approved: 0,
          rejected: 0,
        },
        referenceTime: '2026-08-23 21:00',
      }
    );

    expect(answer).toContain('69%');
    expect(answer).toContain('principal sinal de gargalo está na revisão');
    expect(answer).toContain('Hipótese de causa provável:');
    expect(answer).toContain('Fila de análise/aprovação');
    expect(answer).toContain('Próxima verificação recomendada:');
    expect(answer).toContain('ainda não prova a causa técnica');
  });

  it('identifica falta de envio quando MISSING domina', () => {
    const answer = formatDriverDocumentsInvestigation(
      {
        driversAffected: 10,
        summary: {
          MISSING: 7,
          SUBMITTED: 3,
        },
        compliancePending: 0,
      },
      {
        available: true,
        total: 20,
        byStatus: {},
        byVehicleType: {},
        pendingApproval: 0,
        docsMissing: 7,
        docsSubmitted: 3,
        docsRejected: 0,
        compliancePending: 0,
        activeDrivers: 10,
        suspendedDrivers: 0,
        modalities: {
          available: true,
          pending: 0,
          approved: 0,
          rejected: 0,
        },
        referenceTime: '2026-08-23 21:00',
      }
    );

    expect(answer).toContain('principal sinal de gargalo está no envio');
  });
});

describe('Investigador v1 — contrato de roteamento', () => {
  it('reconhece a frase usada em produção', () => {
    expect(
      isDriverDocumentsInvestigation(
        'Investigue por que temos 26 motoristas com documentos pendentes.'
      )
    ).toBe(true);
  });
});
