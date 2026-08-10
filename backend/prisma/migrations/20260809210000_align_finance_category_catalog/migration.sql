-- AlignFinanceCategoryCatalog (commit 030f49e3 delta)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Materializes 12 new categories and activates 3 existing ones from the
-- canonical FINANCE_CATEGORY_SEEDS that were never deployed via migration.
--
-- FAIL-CLOSED: validates structural consistency before any write.
-- Idempotent: safe to re-run; second execution is a no-op.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Phase 0: Structural integrity validation ─────────────────────────────────
-- Fails explicitly if code/ID pairs are inconsistent with the canonical catalog.

DO $$
DECLARE
  r RECORD;
  expected_codes TEXT[] := ARRAY[
    'IMPOSTOS_E_TAXAS', 'IRPJ', 'CSLL', 'ISS', 'PIS_COFINS',
    'SIMPLES_NACIONAL', 'OUTROS_IMPOSTOS', 'GITHUB',
    'GESTORES_TERRITORIAIS', 'LICENCAS_MUNICIPAIS',
    'SERVICOS_JURIDICOS', 'DIVULGACAO_MARKETING',
    'CONTABILIDADE', 'PRO_LABORE', 'OUTRAS_DESPESAS'
  ];
  expected_ids TEXT[] := ARRAY[
    'fcat_9cb6d78d7a883ba1c3e30f0973dbe341', 'fcat_649e1e6cb04d5805ae82341832821a9e',
    'fcat_4881f938cef55b4ebf8717c48de09ade', 'fcat_0a0132890382603ff5428fc2ca3f2dd1',
    'fcat_2c05f1d2f6948732afa3db9e0e992900', 'fcat_29e77f028c3b0de895c04f0bdbc0be64',
    'fcat_8f4c3ba427aef197682a07f1bfc88c5f', 'fcat_da6b3ede41336c2473cd22bbc1affc51',
    'fcat_df1314d767be46d6f0d7c34cf7ea5afa', 'fcat_ed994bd0ce7c65ba47a03c8724be9f36',
    'fcat_ec867fa7664d6e952cbed1b850eb2e66', 'fcat_da2a5828541b6e0e1b2c3bc7e87d1254',
    'fcat_e11c24a9128072b5c8d72a1160f120cb', 'fcat_26dc69afcd59ee348780a6616ad410ff',
    'fcat_986dd29e49fd4a974f30244fff3be359'
  ];
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(expected_codes, 1) LOOP
    -- Check A: same code exists with DIFFERENT id
    SELECT id, code INTO r
    FROM financial_categories
    WHERE code = expected_codes[i] AND id != expected_ids[i];

    IF FOUND THEN
      RAISE EXCEPTION 'STRUCTURAL CONFLICT: code=% exists with id=% but expected id=%',
        expected_codes[i], r.id, expected_ids[i];
    END IF;

    -- Check B: same id exists with DIFFERENT code
    SELECT id, code INTO r
    FROM financial_categories
    WHERE id = expected_ids[i] AND code != expected_codes[i];

    IF FOUND THEN
      RAISE EXCEPTION 'STRUCTURAL CONFLICT: id=% exists with code=% but expected code=%',
        expected_ids[i], r.code, expected_codes[i];
    END IF;
  END LOOP;
END $$;

-- ── Phase 1: Validate prerequisite parents ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM financial_categories WHERE code = 'TECNOLOGIA_E_PRODUTO' AND is_active = true) THEN
    RAISE EXCEPTION 'PREREQUISITE FAILED: TECNOLOGIA_E_PRODUTO must exist and be active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_categories WHERE code = 'OPERACOES_E_SUPORTE' AND is_active = true) THEN
    RAISE EXCEPTION 'PREREQUISITE FAILED: OPERACOES_E_SUPORTE must exist and be active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_categories WHERE code = 'DESPESAS_ADMINISTRATIVAS' AND is_active = true) THEN
    RAISE EXCEPTION 'PREREQUISITE FAILED: DESPESAS_ADMINISTRATIVAS must exist and be active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_categories WHERE code = 'MARKETING_E_VENDAS' AND is_active = true) THEN
    RAISE EXCEPTION 'PREREQUISITE FAILED: MARKETING_E_VENDAS must exist and be active';
  END IF;
END $$;

-- ── Phase 2: IMPOSTOS_E_TAXAS (new parent, root) ────────────────────────────

INSERT INTO financial_categories (
  id, code, name, kind, parent_id, default_direction,
  requires_document, is_system, is_active, is_postable, sort_order,
  created_at, updated_at
) VALUES (
  'fcat_9cb6d78d7a883ba1c3e30f0973dbe341',
  'IMPOSTOS_E_TAXAS', 'Impostos e taxas', 'EXPENSE',
  NULL, 'OUT', false, true, true, false, 2000, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE SET
  is_active = true, kind = 'EXPENSE', default_direction = 'OUT',
  sort_order = 2000, is_postable = false, updated_at = NOW();

-- ── Phase 3: IMPOSTOS_E_TAXAS children ───────────────────────────────────────

INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, requires_document, is_system, is_active, is_postable, sort_order, created_at, updated_at)
VALUES
  ('fcat_649e1e6cb04d5805ae82341832821a9e', 'IRPJ', 'IRPJ', 'EXPENSE',
   'fcat_9cb6d78d7a883ba1c3e30f0973dbe341', 'OUT', true, true, true, true, 2010, NOW(), NOW()),
  ('fcat_4881f938cef55b4ebf8717c48de09ade', 'CSLL', 'CSLL', 'EXPENSE',
   'fcat_9cb6d78d7a883ba1c3e30f0973dbe341', 'OUT', true, true, true, true, 2020, NOW(), NOW()),
  ('fcat_0a0132890382603ff5428fc2ca3f2dd1', 'ISS', 'ISS', 'EXPENSE',
   'fcat_9cb6d78d7a883ba1c3e30f0973dbe341', 'OUT', true, true, true, true, 2030, NOW(), NOW()),
  ('fcat_2c05f1d2f6948732afa3db9e0e992900', 'PIS_COFINS', 'PIS/COFINS', 'EXPENSE',
   'fcat_9cb6d78d7a883ba1c3e30f0973dbe341', 'OUT', true, true, true, true, 2040, NOW(), NOW()),
  ('fcat_29e77f028c3b0de895c04f0bdbc0be64', 'SIMPLES_NACIONAL', 'Simples Nacional', 'EXPENSE',
   'fcat_9cb6d78d7a883ba1c3e30f0973dbe341', 'OUT', true, true, true, true, 2050, NOW(), NOW()),
  ('fcat_8f4c3ba427aef197682a07f1bfc88c5f', 'OUTROS_IMPOSTOS', 'Outros impostos e taxas', 'EXPENSE',
   'fcat_9cb6d78d7a883ba1c3e30f0973dbe341', 'OUT', false, true, true, true, 2090, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  is_active = true, is_postable = true, kind = 'EXPENSE', default_direction = 'OUT',
  parent_id = EXCLUDED.parent_id, sort_order = EXCLUDED.sort_order,
  requires_document = EXCLUDED.requires_document, updated_at = NOW();

-- ── Phase 4: GITHUB under TECNOLOGIA_E_PRODUTO ──────────────────────────────

INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, requires_document, is_system, is_active, is_postable, sort_order, created_at, updated_at)
VALUES (
  'fcat_da6b3ede41336c2473cd22bbc1affc51',
  'GITHUB', 'GitHub', 'EXPENSE',
  'fcat_8809bbe62cb78a37d898848ab12fe6a5', 'OUT',
  false, true, true, true, 5015, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE SET
  is_active = true, is_postable = true, kind = 'EXPENSE', default_direction = 'OUT',
  parent_id = 'fcat_8809bbe62cb78a37d898848ab12fe6a5', sort_order = 5015, updated_at = NOW();

-- ── Phase 5: GESTORES_TERRITORIAIS, LICENCAS_MUNICIPAIS under OPERACOES_E_SUPORTE

INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, requires_document, is_system, is_active, is_postable, sort_order, created_at, updated_at)
VALUES
  ('fcat_df1314d767be46d6f0d7c34cf7ea5afa', 'GESTORES_TERRITORIAIS', 'Gestores territoriais', 'EXPENSE',
   'fcat_95cbbd9bad2fbecfce1f9c76829bd191', 'OUT', false, true, true, true, 4050, NOW(), NOW()),
  ('fcat_ed994bd0ce7c65ba47a03c8724be9f36', 'LICENCAS_MUNICIPAIS', 'Licenças e taxas municipais', 'EXPENSE',
   'fcat_95cbbd9bad2fbecfce1f9c76829bd191', 'OUT', true, true, true, true, 4060, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  is_active = true, is_postable = true, kind = 'EXPENSE', default_direction = 'OUT',
  parent_id = EXCLUDED.parent_id, sort_order = EXCLUDED.sort_order,
  requires_document = EXCLUDED.requires_document, updated_at = NOW();

-- ── Phase 6: SERVICOS_JURIDICOS under DESPESAS_ADMINISTRATIVAS ───────────────

INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, requires_document, is_system, is_active, is_postable, sort_order, created_at, updated_at)
VALUES (
  'fcat_ec867fa7664d6e952cbed1b850eb2e66',
  'SERVICOS_JURIDICOS', 'Serviços jurídicos', 'EXPENSE',
  'fcat_bafd5ddb91d03c60a27748d76e09d09c', 'OUT',
  false, true, true, true, 7040, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE SET
  is_active = true, is_postable = true, kind = 'EXPENSE', default_direction = 'OUT',
  parent_id = 'fcat_bafd5ddb91d03c60a27748d76e09d09c', sort_order = 7040, updated_at = NOW();

-- ── Phase 7: DIVULGACAO_MARKETING under MARKETING_E_VENDAS ───────────────────

INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, requires_document, is_system, is_active, is_postable, sort_order, created_at, updated_at)
VALUES (
  'fcat_da2a5828541b6e0e1b2c3bc7e87d1254',
  'DIVULGACAO_MARKETING', 'Divulgação e marketing', 'EXPENSE',
  'fcat_a760da5ca4c4655821994de82acb0fb8', 'OUT',
  false, true, true, true, 6030, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE SET
  is_active = true, is_postable = true, kind = 'EXPENSE', default_direction = 'OUT',
  parent_id = 'fcat_a760da5ca4c4655821994de82acb0fb8', sort_order = 6030, updated_at = NOW();

-- ── Phase 8: ACTIVATE existing categories ────────────────────────────────────

UPDATE financial_categories
SET is_active = true, is_postable = true, updated_at = NOW()
WHERE code = 'CONTABILIDADE' AND (is_active = false OR is_postable = false);

UPDATE financial_categories
SET is_active = true, is_postable = true, updated_at = NOW()
WHERE code = 'PRO_LABORE' AND (is_active = false OR is_postable = false);

UPDATE financial_categories
SET is_active = true, is_postable = true, updated_at = NOW()
WHERE code = 'OUTRAS_DESPESAS' AND (is_active = false OR is_postable = false);

-- ── Phase 9: Post-execution integrity check ──────────────────────────────────

DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM (
    VALUES
      ('IMPOSTOS_E_TAXAS'), ('IRPJ'), ('CSLL'), ('ISS'), ('PIS_COFINS'),
      ('SIMPLES_NACIONAL'), ('OUTROS_IMPOSTOS'), ('GITHUB'),
      ('GESTORES_TERRITORIAIS'), ('LICENCAS_MUNICIPAIS'),
      ('SERVICOS_JURIDICOS'), ('DIVULGACAO_MARKETING'),
      ('CONTABILIDADE'), ('PRO_LABORE'), ('OUTRAS_DESPESAS')
  ) AS expected(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM financial_categories fc
    WHERE fc.code = expected.code AND fc.is_active = true
  );

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: % categories still missing or inactive after migration', missing_count;
  END IF;
END $$;
