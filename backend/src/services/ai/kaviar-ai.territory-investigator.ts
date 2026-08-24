import { pool } from '../../db';
import {
  getTerritoryManagerCoverage,
  type TerritoryManagerCoverageData,
} from './kaviar-ai.command-center';

export type TerritoryManagerInvestigationData = {
  available: boolean;
  found: boolean;
  city: string;
  uf: string;
  coverage: TerritoryManagerCoverageData;
  history: {
    assignmentId: string;
    assignmentStatus: string;
    startedAt: string | null;
    endedAt: string | null;
    endReason: string | null;
    updatedAt: string | null;
    adminId: string;
    adminName: string;
    adminActive: boolean;
    territoryName: string;
    territoryLevel: string;
    territoryActive: boolean;
  }[];
};

export function isTerritoryManagerInvestigation(question: string): boolean {
  const q = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return (
    (q.includes('investigue') || q.includes('investigar')) &&
    (q.includes('gestor') || q.includes('assignment'))
  );
}

export async function investigateTerritoryManager(
  city: string,
  uf: string
): Promise<TerritoryManagerInvestigationData> {
  const coverageResult = await getTerritoryManagerCoverage({ city, uf });
  const coverage = coverageResult.data;

  if (!coverage.available || !coverage.found || !coverage.territory) {
    return {
      available: coverage.available,
      found: false,
      city,
      uf,
      coverage,
      history: [],
    };
  }

  const result = await pool.query<{
    assignment_id: string;
    assignment_status: string;
    started_at: Date | null;
    ended_at: Date | null;
    end_reason: string | null;
    updated_at: Date | null;
    admin_id: string;
    admin_name: string;
    admin_active: boolean;
    territory_name: string;
    territory_level: string;
    territory_active: boolean;
  }>(`
    SELECT
      tma.id AS assignment_id,
      tma.status AS assignment_status,
      tma.started_at,
      tma.ended_at,
      tma.end_reason,
      tma.updated_at,
      a.id AS admin_id,
      a.name AS admin_name,
      a.is_active AS admin_active,
      managed_t.name AS territory_name,
      managed_t.level AS territory_level,
      managed_t.is_active AS territory_active
    FROM territory_manager_assignments tma
    JOIN admins a
      ON a.id = tma.admin_id
    JOIN operational_territories managed_t
      ON managed_t.id = tma.territory_id
    WHERE
      managed_t.id = $1
      OR (
        managed_t.parent_id = $1
        AND managed_t.level = 'region'
      )
    ORDER BY
      COALESCE(tma.ended_at, tma.updated_at, tma.started_at) DESC
    LIMIT 20
  `, [coverage.territory.id]);

  return {
    available: true,
    found: true,
    city,
    uf,
    coverage,
    history: result.rows.map(row => ({
      assignmentId: row.assignment_id,
      assignmentStatus: row.assignment_status,
      startedAt: row.started_at?.toISOString() ?? null,
      endedAt: row.ended_at?.toISOString() ?? null,
      endReason: row.end_reason,
      updatedAt: row.updated_at?.toISOString() ?? null,
      adminId: row.admin_id,
      adminName: row.admin_name,
      adminActive: row.admin_active,
      territoryName: row.territory_name,
      territoryLevel: row.territory_level,
      territoryActive: row.territory_active,
    })),
  };
}

export function formatTerritoryManagerInvestigation(
  data: TerritoryManagerInvestigationData
): string {
  if (!data.available) {
    return 'Não foi possível investigar a gestão territorial no momento.';
  }

  if (!data.found || !data.coverage.territory) {
    return `Território ${data.city}/${data.uf} não encontrado no sistema.`;
  }

  const c = data.coverage;
  const territory = c.territory!;
  const parts: string[] = [];

  parts.push(`🔎 Investigação de Gestor — ${data.city}/${data.uf}`);
  parts.push(`Território: ${territory.name} (${territory.status})`);
  parts.push(`Gestores ativos atualmente: ${c.managers.length}`);
  parts.push(`Regiões ativas: ${c.activeRegions}`);
  parts.push(`Regiões sem gestor regional específico: ${c.uncoveredRegions.length}`);
  parts.push(`Cobertura territorial: ${c.coverageStatus}`);

  parts.push('');
  parts.push('Histórico de assignments:');

  if (data.history.length === 0) {
    parts.push('  • Nenhum assignment de gestor encontrado para a cidade ou suas regiões.');
  } else {
    for (const item of data.history.slice(0, 10)) {
      const scope =
        item.territoryLevel === 'city'
          ? 'cidade'
          : `região ${item.territoryName}`;

      const ended = item.endedAt
        ? ` | encerrado em ${item.endedAt.slice(0, 10)}`
        : '';

      const reason = item.endReason
        ? ` | motivo: ${item.endReason}`
        : '';

      parts.push(
        `  • ${item.adminName} — ${scope} — assignment ${item.assignmentStatus}` +
        ` — admin ${item.adminActive ? 'ativo' : 'inativo'}` +
        `${ended}${reason}`
      );
    }
  }

  parts.push('');
  parts.push('Conclusão:');

  if (c.managers.length > 0) {
    parts.push('Existe cobertura ativa de gestor no momento.');
  } else if (data.history.length === 0) {
    parts.push(
      'O território está sem gestor porque não existe assignment atual nem histórico de gestor para a cidade ou suas regiões.'
    );
  } else {
    const activeButInvalid = data.history.find(
      item =>
        item.assignmentStatus === 'active' &&
        !item.endedAt &&
        (!item.adminActive || !item.territoryActive)
    );

    const latestEnded = data.history.find(
      item => item.endedAt || item.assignmentStatus !== 'active'
    );

    if (activeButInvalid) {
      parts.push(
        `Há assignment formalmente ativo de ${activeButInvalid.adminName}, ` +
        `mas ele não gera cobertura operacional porque ` +
        `${!activeButInvalid.adminActive ? 'o admin está inativo' : 'o território/região do assignment está inativo'}.`
      );
    } else if (latestEnded) {
      parts.push(
        `Não existe assignment ativo válido. O histórico mostra vínculo anterior de ` +
        `${latestEnded.adminName}, atualmente encerrado ou inativo.`
      );
    } else {
      parts.push(
        'Não existe assignment ativo válido cobrindo a cidade ou uma região ativa.'
      );
    }
  }

  parts.push('');
  parts.push('Próxima ação recomendada:');

  if (c.managers.length === 0) {
    const invalidActive = data.history.find(
      item =>
        item.assignmentStatus === 'active' &&
        !item.endedAt &&
        !item.adminActive
    );

    if (invalidActive) {
      parts.push(
        `Regularizar/encerrar o assignment inconsistente de ${invalidActive.adminName} e vincular um admin ativo como gestor.`
      );
    } else {
      parts.push(
        'Vincular um gestor ativo à cidade ou à região ativa sem cobertura.'
      );
    }
  } else {
    parts.push('Nenhuma correção de assignment é necessária neste momento.');
  }

  if (c.coverageStatus !== 'COMPLETE') {
    parts.push(
      'Depois da regularização do gestor, revisar e homologar a cobertura territorial.'
    );
  }

  return parts.join('\n');
}
