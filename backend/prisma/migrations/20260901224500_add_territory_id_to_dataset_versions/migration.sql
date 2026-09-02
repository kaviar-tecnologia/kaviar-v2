-- Fase 3A — vínculo territorial explícito em territorial_dataset_versions.
-- ADITIVA: adiciona coluna nullable + FK + índice. NÃO altera/removê city/uf.
-- NÃO aplicada em produção sem autorização (sem prisma migrate deploy aqui).

-- 1) Coluna nullable
ALTER TABLE "territorial_dataset_versions" ADD COLUMN "territory_id" TEXT;

-- 2) FK para operational_territories.
--    ON DELETE RESTRICT: preserva a integridade do ownership. Uma versão com
--    territory_id explícito NUNCA deve perder o vínculo silenciosamente (o que
--    a rebaixaria ao fallback legado city+uf). O único hard delete de território
--    em produção (DELETE /api/admin/territories/:id) já bloqueia territórios com
--    vínculos (409); RESTRICT reforça essa invariante no banco. O ciclo de vida
--    normal do território é ativar/inativar via status/is_active, não exclusão.
ALTER TABLE "territorial_dataset_versions"
  ADD CONSTRAINT "territorial_dataset_versions_territory_id_fkey"
  FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Índice
CREATE INDEX "territorial_dataset_versions_territory_id_idx"
  ON "territorial_dataset_versions"("territory_id");

-- 4) BACKFILL conservador e IDEMPOTENTE.
--    Preenche territory_id SOMENTE quando existe EXATAMENTE 1 território
--    correspondente por (city, uf) normalizados (lower+trim). Nunca adivinha:
--    - 0 correspondências  -> permanece NULL
--    - >1 correspondências -> permanece NULL (ambíguo)
--    Idempotente: só toca linhas com territory_id IS NULL.
--    Regra de match espelha datasetBelongsToTerritory (UF igual; city == city_name OU name),
--    usando lower(trim(...)) (comparação estrita; casos com acento divergente
--    permanecem NULL por segurança).
WITH matches AS (
  SELECT
    v.id AS version_id,
    (
      SELECT count(*)
      FROM "operational_territories" t
      WHERE lower(trim(t."uf")) = lower(trim(v."uf"))
        AND (
          lower(trim(t."city_name")) = lower(trim(v."city"))
          OR lower(trim(t."name")) = lower(trim(v."city"))
        )
    ) AS match_count,
    (
      SELECT max(t.id)
      FROM "operational_territories" t
      WHERE lower(trim(t."uf")) = lower(trim(v."uf"))
        AND (
          lower(trim(t."city_name")) = lower(trim(v."city"))
          OR lower(trim(t."name")) = lower(trim(v."city"))
        )
    ) AS the_id
  FROM "territorial_dataset_versions" v
  WHERE v."territory_id" IS NULL
)
UPDATE "territorial_dataset_versions" v
SET "territory_id" = m.the_id
FROM matches m
WHERE v.id = m.version_id
  AND m.match_count = 1;  -- SOMENTE casos inequívocos
