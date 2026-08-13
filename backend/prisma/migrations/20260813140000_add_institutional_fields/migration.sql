-- Add institutional fields to legal_entities
ALTER TABLE "legal_entities"
  ADD COLUMN IF NOT EXISTS "data_abertura" DATE,
  ADD COLUMN IF NOT EXISTS "situacao_cadastral" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "data_situacao_cadastral" DATE,
  ADD COLUMN IF NOT EXISTS "porte" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "natureza_juridica" TEXT,
  ADD COLUMN IF NOT EXISTS "capital_social_cents" BIGINT,
  ADD COLUMN IF NOT EXISTS "email_institucional" TEXT,
  ADD COLUMN IF NOT EXISTS "telefone_institucional" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_institucional" TEXT,
  ADD COLUMN IF NOT EXISTS "site" TEXT,
  ADD COLUMN IF NOT EXISTS "logradouro" TEXT,
  ADD COLUMN IF NOT EXISTS "numero" TEXT,
  ADD COLUMN IF NOT EXISTS "complemento" TEXT,
  ADD COLUMN IF NOT EXISTS "bairro" TEXT,
  ADD COLUMN IF NOT EXISTS "cep" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "cnae_principal" TEXT,
  ADD COLUMN IF NOT EXISTS "cnaes_secundarios" TEXT[] DEFAULT '{}';

-- Reconcile CNPJ: normalize ONLY the KAVIAR CNPJ if stored with punctuation.
-- Does NOT alter any other entity's CNPJ.
DO $$
DECLARE
  v_normalized_count INT;
  v_formatted_count INT;
BEGIN
  SELECT COUNT(*) INTO v_normalized_count FROM legal_entities WHERE cnpj = '67783601000199';
  SELECT COUNT(*) INTO v_formatted_count FROM legal_entities WHERE cnpj = '67.783.601/0001-99';

  -- If both representations exist as separate records, abort to avoid data loss.
  IF v_normalized_count > 0 AND v_formatted_count > 0 THEN
    RAISE EXCEPTION 'KAVIAR CNPJ exists in both formatted and normalized forms as separate records. Manual reconciliation required.';
  END IF;

  -- If only the formatted version exists, normalize it.
  IF v_formatted_count > 0 THEN
    UPDATE legal_entities
    SET cnpj = '67783601000199', updated_at = NOW()
    WHERE cnpj = '67.783.601/0001-99';
  END IF;
END $$;

-- Create legal_entity_persons table
CREATE TABLE IF NOT EXISTS "legal_entity_persons" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "entity_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "funcao" TEXT NOT NULL,
  "funcao_origem" TEXT NOT NULL DEFAULT 'INTERNAL',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_entity_persons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_entity_persons_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "legal_entity_persons_entity_id_nome_funcao_key"
  ON "legal_entity_persons"("entity_id", "nome", "funcao");

CREATE INDEX IF NOT EXISTS "legal_entity_persons_entity_id_is_active_idx"
  ON "legal_entity_persons"("entity_id", "is_active");

-- Upsert KAVIAR matriz (idempotent by normalized CNPJ)
INSERT INTO "legal_entities" (
  "id", "razao_social", "nome_fantasia", "cnpj", "entity_type",
  "uf", "municipio", "endereco",
  "data_abertura", "situacao_cadastral", "data_situacao_cadastral",
  "porte", "natureza_juridica",
  "capital_social_cents", "email_institucional", "telefone_institucional",
  "whatsapp_institucional", "site",
  "logradouro", "numero", "complemento", "bairro", "cep",
  "cnae_principal", "cnaes_secundarios",
  "is_active", "created_at", "updated_at"
) VALUES (
  gen_random_uuid()::text,
  'KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA',
  'KAVIAR',
  '67783601000199',
  'MATRIZ',
  'RJ',
  'Rio de Janeiro',
  'Estrada das Furnas, 03001, ANTIGOS 2253 781, Itanhangá, Rio de Janeiro/RJ, CEP 22.641-681',
  '2026-07-01',
  'ATIVA',
  '2026-07-01',
  'ME',
  '206-2 — Sociedade Empresária Limitada',
  1000000,
  'contato@kaviar.com.br',
  '(21) 6864-8777',
  '+55 21 6864-8777',
  'https://kaviar.com.br',
  'Estrada das Furnas',
  '03001',
  'ANTIGOS 2253 781',
  'Itanhangá',
  '22.641-681',
  '62.03-1-00 — Desenvolvimento e licenciamento de programas de computador não customizáveis',
  ARRAY[
    '52.29-0-99 — Outras atividades auxiliares dos transportes terrestres não especificadas anteriormente',
    '63.19-4-00 — Portais, provedores de conteúdo e outros serviços de informação na internet',
    '74.90-1-04 — Atividades de intermediação e agenciamento de serviços e negócios em geral, exceto imobiliários'
  ],
  true,
  NOW(),
  NOW()
) ON CONFLICT ("cnpj") DO UPDATE SET
  "razao_social" = EXCLUDED."razao_social",
  "nome_fantasia" = EXCLUDED."nome_fantasia",
  "entity_type" = EXCLUDED."entity_type",
  "uf" = EXCLUDED."uf",
  "municipio" = EXCLUDED."municipio",
  "endereco" = EXCLUDED."endereco",
  "data_abertura" = EXCLUDED."data_abertura",
  "situacao_cadastral" = EXCLUDED."situacao_cadastral",
  "data_situacao_cadastral" = EXCLUDED."data_situacao_cadastral",
  "porte" = EXCLUDED."porte",
  "natureza_juridica" = EXCLUDED."natureza_juridica",
  "capital_social_cents" = EXCLUDED."capital_social_cents",
  "email_institucional" = EXCLUDED."email_institucional",
  "telefone_institucional" = EXCLUDED."telefone_institucional",
  "whatsapp_institucional" = EXCLUDED."whatsapp_institucional",
  "site" = EXCLUDED."site",
  "logradouro" = EXCLUDED."logradouro",
  "numero" = EXCLUDED."numero",
  "complemento" = EXCLUDED."complemento",
  "bairro" = EXCLUDED."bairro",
  "cep" = EXCLUDED."cep",
  "cnae_principal" = EXCLUDED."cnae_principal",
  "cnaes_secundarios" = EXCLUDED."cnaes_secundarios",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = NOW();

-- Seed persons (idempotent by entity+nome+funcao unique constraint)
DO $$
DECLARE
  v_entity_id TEXT;
BEGIN
  SELECT id INTO v_entity_id FROM legal_entities WHERE cnpj = '67783601000199';
  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'KAVIAR entity not found after upsert';
  END IF;

  INSERT INTO legal_entity_persons (id, entity_id, nome, funcao, funcao_origem, is_active, created_at, updated_at)
  VALUES
    (gen_random_uuid()::text, v_entity_id, 'Fernanda Aparecida de Goes', 'Sócia-Administradora', 'RFB_QSA', true, NOW(), NOW()),
    (gen_random_uuid()::text, v_entity_id, 'Aparecido de Goes', 'Sócio-Administrador', 'RFB_QSA', true, NOW(), NOW()),
    (gen_random_uuid()::text, v_entity_id, 'Aparecido de Goes', 'CEO', 'INTERNAL', true, NOW(), NOW())
  ON CONFLICT (entity_id, nome, funcao) DO NOTHING;
END $$;
