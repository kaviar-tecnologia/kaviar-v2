-- Additive seed: document types requested by user not in initial seed
-- Idempotent: ON CONFLICT (code) DO NOTHING

INSERT INTO "accounting_document_types" ("id", "code", "name", "description", "category", "requires_validity", "renewal_alert_days", "sort_order", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'PROCURACAO_PREFEITURA', 'Procuração da Prefeitura', 'Procuração para representação junto à prefeitura', 'PROCURACAO', true, 30, 20, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'PROCURACAO_SEFAZ', 'Procuração SEFAZ', 'Procuração para representação junto à SEFAZ estadual', 'PROCURACAO', true, 30, 21, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'NOTA_FISCAL', 'Nota Fiscal', 'Notas fiscais de serviço ou produto', 'FISCAL', false, NULL, 22, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'GUIA_TRIBUTO', 'Guia ou Tributo', 'Guias de recolhimento, boletos e tributos', 'FISCAL', false, NULL, 23, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SPED', 'SPED', 'Arquivos SPED Fiscal, Contábil ou Contribuições', 'FISCAL', false, NULL, 24, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'HONORARIOS_CONTABEIS', 'Honorários Contábeis', 'Boletos e recibos de honorários do escritório contábil', 'FISCAL', false, NULL, 25, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
