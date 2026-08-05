-- Register KAVIAR legal entity and link to pilot accountant
-- Idempotent: ON CONFLICT DO NOTHING

-- 1. Insert KAVIAR as legal entity (if not exists)
INSERT INTO "legal_entities" ("id", "razao_social", "nome_fantasia", "cnpj", "entity_type", "uf", "municipio", "is_active", "created_at", "updated_at")
VALUES (
  'a1b2c3d4-kavr-4000-8000-000000000001',
  'KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA',
  'KAVIAR',
  '67783601000199',
  'MATRIZ',
  'RJ',
  'Rio de Janeiro',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("cnpj") DO NOTHING;

-- 2. Link KAVIAR to the pilot accountant (aparecido.goes@gmail.com)
-- Uses subquery to find accountant ID dynamically
INSERT INTO "accountant_entity_links" (
  "id", "accountant_id", "legal_entity_id", "scope", "status",
  "can_view", "can_upload", "can_download", "can_request_correction", "can_mark_processed", "can_close_period",
  "inherits_children", "starts_at", "created_by_admin_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  a.id,
  le.id,
  'COMPLETO',
  'ACTIVE',
  true, true, true, true, true, true,
  false,
  NOW(),
  (SELECT id FROM admins LIMIT 1),
  NOW(),
  NOW()
FROM accountants a
CROSS JOIN legal_entities le
WHERE a.email = 'aparecido.goes@gmail.com'
  AND le.cnpj = '67783601000199'
  AND NOT EXISTS (
    SELECT 1 FROM accountant_entity_links ael
    WHERE ael.accountant_id = a.id AND ael.legal_entity_id = le.id AND ael.status = 'ACTIVE'
  );
