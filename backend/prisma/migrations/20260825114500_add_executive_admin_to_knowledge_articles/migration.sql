-- Migration: add EXECUTIVE_ADMIN to knowledge_articles allowed_roles
-- Context: RAG v1 articles were seeded with SUPER_ADMIN/FINANCE only.
-- EXECUTIVE_ADMIN needs read access to approved articles to enable
-- administrative continuity without SUPER_ADMIN presence.
--
-- This is additive and non-destructive:
-- - Preserves existing SUPER_ADMIN and FINANCE access
-- - Only appends EXECUTIVE_ADMIN where not already present
-- - Affects only APPROVED articles with CURRENT scope

UPDATE knowledge_articles
SET allowed_roles = array_append(allowed_roles, 'EXECUTIVE_ADMIN'),
    updated_at = NOW()
WHERE status = 'APPROVED'
  AND knowledge_scope = 'CURRENT'
  AND NOT ('EXECUTIVE_ADMIN' = ANY(allowed_roles));
