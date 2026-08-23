import { describe, expect, it } from 'vitest';

import {
  classifyCrmIntent,
  formatCrmIntent,
} from '../src/services/ai/kaviar-ai.crm-intent';

import { classifyIntent } from '../src/services/ai/kaviar-ai.orchestrator';

import type { CrmLeadsSummaryData } from '../src/services/ai/kaviar-ai.tools';

const DATA: CrmLeadsSummaryData = {
  periodLabel: 'últimos 7 dias',
  newCount: 8,
  noContactCount: 3,
  stale3dCount: 2,
  byStatus: {
    NEW: 3,
    CONTACTED: 4,
    QUALIFIED: 1,
  },
  bySource: {
    CITY_LANDING: 5,
    MANUAL: 3,
  },
  topTerritories: [
    { name: 'Tambaú', count: 5 },
    { name: 'Pirassununga', count: 3 },
  ],
};

describe('CRM semantic intent', () => {
  it('classifies no-contact questions', () => {
    expect(classifyCrmIntent('Tem leads sem contato?')).toBe('CRM_NO_CONTACT');
  });

  it('classifies new leads', () => {
    expect(classifyCrmIntent('Quantos leads novos chegaram hoje?')).toBe('CRM_NEW');
  });

  it('classifies stale leads', () => {
    expect(classifyCrmIntent('Tem leads parados há mais de 3 dias?')).toBe('CRM_STALE');
  });

  it('classifies funnel', () => {
    expect(classifyCrmIntent('Como está o funil dos leads?')).toBe('CRM_FUNNEL');
  });

  it('classifies source', () => {
    expect(classifyCrmIntent('De onde vieram os leads?')).toBe('CRM_SOURCE');
  });

  it('classifies territory', () => {
    expect(classifyCrmIntent('Quais territórios têm mais leads?')).toBe('CRM_TERRITORY');
  });

  it('source question requires CRM canonical source', () => {
    expect(classifyIntent('De onde vieram os leads?')).toBe('CRM');
  });

  it('territory question requires CRM canonical source', () => {
    expect(classifyIntent('Quais territórios têm mais leads?')).toBe('CRM');
  });

  it('orchestrator recognizes source question as CRM', () => {
    expect(classifyIntent('De onde vieram os leads?')).toBe('CRM');
  });

  it('orchestrator recognizes territory question as CRM', () => {
    expect(classifyIntent('Quais territórios têm mais leads?')).toBe('CRM');
  });

  it('no-contact answer does not dump unrelated metrics', () => {
    const answer = formatCrmIntent('CRM_NO_CONTACT', DATA);

    expect(answer).toContain('3');
    expect(answer).toContain('sem contato');
    expect(answer).not.toContain('CITY_LANDING');
    expect(answer).not.toContain('Tambaú');
    expect(answer).not.toContain('QUALIFIED');
  });

  it('new-leads answer is specific', () => {
    const answer = formatCrmIntent('CRM_NEW', DATA);

    expect(answer).toContain('8');
    expect(answer).not.toContain('sem contato');
    expect(answer).not.toContain('CITY_LANDING');
  });

  it('stale answer is specific', () => {
    const answer = formatCrmIntent('CRM_STALE', DATA);

    expect(answer).toContain('2');
    expect(answer).toContain('mais de 3 dias');
    expect(answer).not.toContain('CITY_LANDING');
  });

  it('funnel answer shows statuses only', () => {
    const answer = formatCrmIntent('CRM_FUNNEL', DATA);

    expect(answer).toContain('NEW: 3');
    expect(answer).toContain('CONTACTED: 4');
    expect(answer).not.toContain('CITY_LANDING');
    expect(answer).not.toContain('Tambaú');
  });

  it('source answer shows sources only', () => {
    const answer = formatCrmIntent('CRM_SOURCE', DATA);

    expect(answer).toContain('CITY_LANDING: 5');
    expect(answer).toContain('MANUAL: 3');
    expect(answer).not.toContain('Tambaú');
    expect(answer).not.toContain('QUALIFIED');
  });

  it('territory answer shows territories only', () => {
    const answer = formatCrmIntent('CRM_TERRITORY', DATA);

    expect(answer).toContain('Tambaú: 5');
    expect(answer).toContain('Pirassununga: 3');
    expect(answer).not.toContain('CITY_LANDING');
    expect(answer).not.toContain('QUALIFIED');
  });
});
