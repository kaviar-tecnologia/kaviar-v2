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
  const missing = documents.summary['MISSING'] ?? pipeline.docsMissing ?? 0;
  const submitted = documents.summary['SUBMITTED'] ?? pipeline.docsSubmitted ?? 0;
  const rejected = documents.summary['REJECTED'] ?? pipeline.docsRejected ?? 0;
  const compliancePending =
    documents.compliancePending ?? pipeline.compliancePending ?? 0;

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

  parts.push('');
  parts.push('Próxima verificação recomendada:');
  parts.push(
    'Identificar há quanto tempo os documentos estão em SUBMITTED e quais tipos de documento concentram a maior parte da fila.'
  );

  parts.push('');
  parts.push(
    'A hipótese acima é baseada nos dados disponíveis; ela ainda não prova a causa técnica do gargalo.'
  );

  return parts.join('\n');
}
