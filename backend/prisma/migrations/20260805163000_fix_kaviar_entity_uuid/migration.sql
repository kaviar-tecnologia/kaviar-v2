-- Fix: Replace invalid pseudo-UUID with real UUID for KAVIAR entity
-- Old ID: a1b2c3d4-kavr-4000-8000-000000000001 (contains 'kavr', not valid UUID)
-- New ID: 884907ff-5b04-4dfa-8613-a23216c5fa25 (real UUID)
-- Single transaction: all FKs updated atomically

BEGIN;

-- Disable FK checks temporarily within transaction by deferring constraints
SET CONSTRAINTS ALL DEFERRED;

-- 1. Update all FK references first
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

-- 2. Update the entity itself
UPDATE "legal_entities"
SET "id" = '884907ff-5b04-4dfa-8613-a23216c5fa25'
WHERE "id" = 'a1b2c3d4-kavr-4000-8000-000000000001';

COMMIT;
