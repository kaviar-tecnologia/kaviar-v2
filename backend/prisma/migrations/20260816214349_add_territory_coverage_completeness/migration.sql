-- Fase 2: estado de completude da cobertura territorial por cidade.

ALTER TABLE "operational_territories"
  ADD COLUMN "coverage_status" TEXT NOT NULL DEFAULT 'NOT_LOADED',
  ADD COLUMN "coverage_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "coverage_reviewed_by" TEXT,
  ADD COLUMN "coverage_notes" TEXT;

ALTER TABLE "operational_territories"
  ADD CONSTRAINT "operational_territories_coverage_status_check"
  CHECK (
    "coverage_status" IN (
      'NOT_LOADED',
      'AWAITING_REVIEW',
      'COMPLETE'
    )
  );

-- Cidades que já possuem bairros oficiais ativos têm dados carregados,
-- mas ainda não devem ser consideradas completas sem homologação humana.
UPDATE "operational_territories" AS ot
SET "coverage_status" = 'AWAITING_REVIEW'
WHERE ot."level" = 'city'
  AND (
    -- Preferir vínculo territorial explícito quando existir.
    EXISTS (
      SELECT 1
      FROM "neighborhoods" AS n
      WHERE n."territory_id" = ot."id"
        AND n."is_active" = true
        AND n."area_type" = 'BAIRRO_OFICIAL'
    )

    OR

    -- Compatibilidade com bairros antigos sem territory_id:
    -- usar nome somente quando não houver outra cidade homônima
    -- cadastrada em operational_territories.
    (
      (
        SELECT COUNT(*)
        FROM "operational_territories" AS same_city
        WHERE same_city."level" = 'city'
          AND LOWER(COALESCE(same_city."city_name", same_city."name")) =
              LOWER(COALESCE(ot."city_name", ot."name"))
      ) = 1
      AND EXISTS (
        SELECT 1
        FROM "neighborhoods" AS n
        WHERE LOWER(n."city") =
              LOWER(COALESCE(ot."city_name", ot."name"))
          AND n."is_active" = true
          AND n."area_type" = 'BAIRRO_OFICIAL'
      )
    )
  );
