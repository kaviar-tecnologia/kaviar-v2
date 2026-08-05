-- Fix: Replace invalid pseudo-UUID with real UUID for KAVIAR entity
-- Strategy: Temporarily clear old CNPJ → Insert new → Move FKs → Delete old

-- 1. Temporarily change CNPJ on old row to avoid unique conflict
UPDATE "legal_entities"
SET "cnpj" = '67783601000199_OLD'
WHERE "id" = 'a1b2c3d4-kavr-4000-8000-000000000001';

-- 2. Insert new entity with valid UUID
INSERT INTO "legal_entities" ("id", "razao_social", "nome_fantasia", "cnpj", "entity_type", "uf", "municipio", "is_active", "created_at", "updated_at")
VALUES (
  '884907ff-5b04-4dfa-8613-a23216c5fa25',
  'KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA',
  'KAVIAR',
  '67783601000199',
  'MATRIZ',
  'RJ',
  'Rio de Janeiro',
  true,
  NOW(),
  NOW()
);

-- 3. Move all FK references to new UUID
UPDATE "accountant_entity_links"
SET "legal_entity_id" = '884907ff-5b04-4dfa-8613-a23216c5fa25'
WHERE "legal_entity_id" = 'a1b2c3d4-kavr-4000-8000-000000000001';

UPDATE "accounting_company_documents"
SET "legal_entity_id" = '884907ff-5b04-4dfa-8613-a23216c5fa25'
WHERE "legal_entity_id" = 'a1b2c3d4-kavr-4000-8000-000000000001';

UPDATE "accounting_certificates"
SET "legal_entity_id" = '884907ff-5b04-4dfa-8613-a23216c5fa25'
WHERE "legal_entity_id" = 'a1b2c3d4-kavr-4000-8000-000000000001';

UPDATE "accounting_powers_of_attorney"
SET "legal_entity_id" = '884907ff-5b04-4dfa-8613-a23216c5fa25'
WHERE "legal_entity_id" = 'a1b2c3d4-kavr-4000-8000-000000000001';

UPDATE "accounting_payment_obligations"
SET "legal_entity_id" = '884907ff-5b04-4dfa-8613-a23216c5fa25'
WHERE "legal_entity_id" = 'a1b2c3d4-kavr-4000-8000-000000000001';

-- 4. Delete old entity (no references remain)
DELETE FROM "legal_entities"
WHERE "id" = 'a1b2c3d4-kavr-4000-8000-000000000001';
