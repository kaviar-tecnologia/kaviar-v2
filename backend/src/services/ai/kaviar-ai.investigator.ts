import type { DriversDocumentsPendingData } from './kaviar-ai.tools';
import type { DriverPipelineSummaryData } from './kaviar-ai.command-center';

export function isDriverDocumentsInvestigation(question: string): boolean {
  const q = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const investigation =
    q.includes('investigue') ||
    q.includes('investigar') ||
    q.includes('por que') ||
    q.includes('porque') ||
    q.includes('qual a causa') ||
    q.includes('causa');

  const documents =
    q.includes('document') &&
    (
      q.includes('motorista') ||
      q.includes('motoristas')
    );

  return investigation && documents;
}

export function formatDriverDocumentsInvestigation(
  documents: DriversDocumentsPendingData,
  pipeline: DriverPipelineSummaryData
): string {
  // drivers_documents_pending is the authoritative operational backlog source.
  // driver_pipeline_summary may include approved/rejected legacy records.
  const missing = documents.summary['MISSING'] ?? 0;
  const submitted = documents.summary['SUBMITTED'] ?? 0;
  const rejected = documents.summary['REJECTED'] ?? 0;
  const compliancePending = documents.compliancePending ?? 0;

  const total = documents.driversAffected;
  const submittedPct =
    total > 0 ? Math.round((submitted / total) * 100) : 0;

  const parts: string[] = [
    `Investigação dos ${total} motorista(s) com documentos pendentes:`,
    '',
    'Evidências:',
    `- ${missing} com documento MISSING.`,
    `- ${submitted} com documento SUBMITTED.`,
    `- ${rejected} com documento REJECTED.`,
    `- ${compliancePending} com compliance aguardando aprovação.`,
  ];

  if (total === 0) {
    parts.push('');
    parts.push('Conclusão: não há motoristas com pendência documental nesta consulta.');
    return parts.join('\n');
  }

  parts.push('');
  parts.push('Análise:');

  if (submitted > missing && submittedPct >= 50) {
    parts.push(
      `O principal sinal de gargalo está na revisão: ${submittedPct}% dos motoristas afetados já possuem documento SUBMITTED.`
    );
    parts.push(
      'Isso sugere que a maior parte do problema pode estar no processamento/aprovação dos documentos, e não apenas na falta de envio.'
    );
  } else if (missing > submitted) {
    parts.push(
      'O principal sinal de gargalo está no envio: há mais motoristas com documentos MISSING do que aguardando revisão.'
    );
  } else {
    parts.push(
      'A pendência está distribuída entre falta de documentos e documentos aguardando revisão.'
    );
  }

  if (rejected > 0) {
    parts.push(
      `${rejected} motorista(s) também possuem documento rejeitado e precisam de correção ou reenvio.`
    );
  }

  if (compliancePending > 0) {
    parts.push(
      `${compliancePending} motorista(s) possuem compliance aguardando aprovação, o que pode representar um segundo gargalo de revisão.`
    );
  }

  parts.push('');
  parts.push('Hipótese de causa provável:');

  if (submitted > missing && submittedPct >= 50) {
    parts.push(
      'Fila de análise/aprovação maior do que a fila de documentos realmente faltantes.'
    );
  } else if (missing > submitted) {
    parts.push(
      'Motoristas ainda não enviaram todos os documentos obrigatórios.'
    );
  } else {
    parts.push(
      'Combinação de documentos não enviados e fila de análise pendente.'
    );
  }

  const age = documents.submittedAge;
  const byType = documents.submittedByType ?? {};

  if (age) {
    parts.push('');
    parts.push('Idade da fila SUBMITTED:');
    parts.push(`- Menos de 1 dia: ${age.lessThan1Day} motorista(s).`);
    parts.push(`- De 1 a 3 dias: ${age.days1To3} motorista(s).`);
    parts.push(`- De 4 a 7 dias: ${age.days4To7} motorista(s).`);
    parts.push(`- Mais de 7 dias: ${age.moreThan7Days} motorista(s).`);

    if (age.unknown > 0) {
      parts.push(`- Sem data de envio registrada: ${age.unknown} motorista(s).`);
    }

    if (documents.oldestSubmittedDays !== null &&
        documents.oldestSubmittedDays !== undefined) {
      parts.push(
        `- Documento SUBMITTED mais antigo: aproximadamente ${documents.oldestSubmittedDays} dia(s).`
      );
    }
  }

  const rankedTypes = Object.entries(byType)
    .sort((a, b) => b[1] - a[1]);

  if (rankedTypes.length > 0) {
    parts.push('');
    parts.push('Tipos de documento concentrando a fila:');

    for (const [type, count] of rankedTypes.slice(0, 5)) {
      parts.push(`- ${type}: ${count} motorista(s).`);
    }

    parts.push(
      'Observação: um motorista pode possuir mais de um tipo de documento SUBMITTED.'
    );
  }

  parts.push('');
  parts.push('Próxima verificação recomendada:');

  if (age && age.moreThan7Days > 0) {
    parts.push(
      'Priorizar os documentos SUBMITTED há mais de 7 dias e verificar por que ainda não foram revisados.'
    );
  } else {
    parts.push(
      'Revisar primeiro os tipos de documento com maior concentração e identificar o responsável pela fila de aprovação.'
    );
  }

  parts.push('');
  parts.push(
    'A hipótese acima é baseada nos dados disponíveis; ela ainda não prova a causa técnica do gargalo.'
  );

  return parts.join('\n');
}
