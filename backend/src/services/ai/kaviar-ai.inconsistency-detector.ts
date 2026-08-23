import type { DailyBriefingData } from './kaviar-ai.tools';

export type FindingType =
  | 'INCONSISTENCY'
  | 'RISK'
  | 'BACKLOG'
  | 'DATA_GAP';

export type FindingSeverity =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export function isInconsistencyQuestion(question: string): boolean {
  const q = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return (
    q.includes('inconsistencia') ||
    q.includes('inconsistencias') ||
    q.includes('erro no sistema') ||
    q.includes('erros no sistema') ||
    q.includes('risco operacional') ||
    q.includes('riscos operacionais') ||
    q.includes('o que esta errado') ||
    q.includes('tem algo errado')
  );
}

export type InconsistencyFinding = {
  code: string;
  type: FindingType;
  severity: FindingSeverity;
  title: string;
  evidence: string;
  impact: string;
  recommendedAction: string;
};

export function detectOperationalFindings(
  data: DailyBriefingData
): InconsistencyFinding[] {
  const findings: InconsistencyFinding[] = [];

  if (data.rides.available && data.rides.pendingAdjustment > 0) {
    findings.push({
      code: 'RIDES_PENDING_ADJUSTMENT',
      type: 'INCONSISTENCY',
      severity: 'HIGH',
      title: 'Corridas com ajuste pendente',
      evidence: `${data.rides.pendingAdjustment} corrida(s) possuem ajuste pendente.`,
      impact:
        'Uma corrida encerrada com ajuste pendente pode manter financeiro ou operação incompletos.',
      recommendedAction:
        'Revisar as corridas afetadas e identificar por que o ajuste ainda não foi concluído.',
    });
  }

  if (data.finance.available && data.finance.overdueCount > 0) {
    findings.push({
      code: 'FINANCE_OVERDUE',
      type: 'RISK',
      severity: 'HIGH',
      title: 'Obrigações financeiras vencidas',
      evidence: `${data.finance.overdueCount} obrigação(ões) financeira(s) estão vencidas.`,
      impact:
        'Obrigações vencidas podem gerar multa, bloqueio de fornecedor ou perda de controle financeiro.',
      recommendedAction:
        'Revisar as obrigações vencidas e confirmar pagamento, renegociação ou regularização.',
    });
  }

  if (data.drivers.available && data.drivers.docsPending > 0) {
    findings.push({
      code: 'DRIVERS_DOCS_PENDING',
      type: 'BACKLOG',
      severity: 'MEDIUM',
      title: 'Motoristas com documentos pendentes',
      evidence: `${data.drivers.docsPending} motorista(s) possuem documentos pendentes.`,
      impact:
        'Pendências documentais podem atrasar aprovação e disponibilidade de motoristas.',
      recommendedAction:
        'Identificar os documentos faltantes e priorizar cobrança ou validação.',
    });
  }

  if (data.drivers.available && data.drivers.pendingApproval > 0) {
    findings.push({
      code: 'DRIVERS_PENDING_APPROVAL',
      type: 'BACKLOG',
      severity: 'MEDIUM',
      title: 'Motoristas aguardando aprovação',
      evidence: `${data.drivers.pendingApproval} motorista(s) aguardam aprovação.`,
      impact:
        'Uma fila de aprovação acumulada pode reduzir a oferta de motoristas disponíveis.',
      recommendedAction:
        'Revisar a fila de aprovação e separar casos prontos dos que ainda possuem bloqueios.',
    });
  }

  if (data.drivers.available && data.drivers.compliancePending > 0) {
    findings.push({
      code: 'DRIVERS_COMPLIANCE_PENDING',
      type: 'RISK',
      severity: 'MEDIUM',
      title: 'Pendências de compliance de motoristas',
      evidence: `${data.drivers.compliancePending} pendência(s) de compliance foram encontradas.`,
      impact:
        'Motoristas com compliance incompleto não devem avançar para operação sem revisão.',
      recommendedAction:
        'Revisar os requisitos de compliance pendentes antes de liberar os motoristas envolvidos.',
    });
  }

  if (data.leads.available && data.leads.stale3d > 0) {
    findings.push({
      code: 'LEADS_STALE',
      type: 'BACKLOG',
      severity: 'MEDIUM',
      title: 'Leads parados há mais de três dias',
      evidence: `${data.leads.stale3d} lead(s) estão parados há mais de 3 dias.`,
      impact:
        'A demora no atendimento pode reduzir conversão e perder candidatos ou parceiros.',
      recommendedAction:
        'Priorizar contato com os leads mais antigos e registrar o resultado no CRM.',
    });
  }

  if (
    data.territories.available &&
    data.territories.withoutManagerCount > 0
  ) {
    findings.push({
      code: 'TERRITORIES_WITHOUT_MANAGER',
      type: 'INCONSISTENCY',
      severity: 'MEDIUM',
      title: 'Territórios sem gestor',
      evidence: `${data.territories.withoutManagerCount} território(s) estão sem gestor.`,
      impact:
        'Um território sem responsável pode ficar sem acompanhamento operacional e regulatório.',
      recommendedAction:
        'Identificar os territórios afetados e definir ou confirmar o responsável.',
    });
  }

  for (const unavailable of data.unavailableItems) {
    findings.push({
      code: 'DATA_SOURCE_UNAVAILABLE',
      type: 'DATA_GAP',
      severity: 'MEDIUM',
      title: 'Fonte de dados indisponível',
      evidence: unavailable,
      impact:
        'O Supervisor pode estar tomando decisões com visão incompleta do estado atual.',
      recommendedAction:
        'Investigar a fonte indisponível antes de concluir que não existem outras pendências.',
    });
  }

  const severityOrder: Record<FindingSeverity, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  return findings.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

export function formatOperationalFindings(
  findings: InconsistencyFinding[]
): string {
  if (findings.length === 0) {
    return 'Não encontrei inconsistências ou riscos operacionais nas fontes consultadas.';
  }

  const parts = [
    `Encontrei ${findings.length} achado(s) que merecem revisão.`,
  ];

  findings.slice(0, 7).forEach((finding, index) => {
    parts.push('');
    parts.push(`${index + 1}. ${finding.title} [${finding.severity}]`);
    parts.push(`Evidência: ${finding.evidence}`);
    parts.push(`Impacto: ${finding.impact}`);
    parts.push(`Ação recomendada: ${finding.recommendedAction}`);
  });

  return parts.join('\n');
}
