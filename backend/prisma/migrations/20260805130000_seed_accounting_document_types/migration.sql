-- Seed: Initial document types for the Accountant Portal MVP
-- These are the minimum types needed for a functional portal

INSERT INTO "accounting_document_types" ("id", "code", "name", "description", "category", "requires_validity", "renewal_alert_days", "sort_order", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'CONTRATO_SOCIAL', 'Contrato Social', 'Contrato social e alterações contratuais', 'SOCIETARIO', false, NULL, 1, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'CARTAO_CNPJ', 'Cartão CNPJ', 'Comprovante de Inscrição e Situação Cadastral', 'SOCIETARIO', false, NULL, 2, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'CERTIFICADO_DIGITAL', 'Certificado Digital', 'Certificado digital e-CNPJ ou e-CPF', 'CERTIFICADO', true, 60, 3, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'PROCURACAO_ECAC', 'Procuração e-CAC', 'Procuração eletrônica para acesso ao e-CAC', 'PROCURACAO', true, 30, 4, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'INSCRICAO_MUNICIPAL', 'Inscrição Municipal', 'Comprovante de inscrição municipal (ISS)', 'INSCRICAO', false, NULL, 5, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'INSCRICAO_ESTADUAL', 'Inscrição Estadual', 'Comprovante de inscrição estadual (ICMS)', 'INSCRICAO', false, NULL, 6, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'ALVARA_FUNCIONAMENTO', 'Alvará de Funcionamento', 'Alvará de localização e funcionamento', 'LICENCA', true, 60, 7, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'LICENCA_SANITARIA', 'Licença Sanitária', 'Licença da vigilância sanitária (ANVISA/municipal)', 'LICENCA', true, 60, 8, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'COMPROVANTE_ENDERECO', 'Comprovante de Endereço', 'Comprovante de endereço do estabelecimento', 'SOCIETARIO', false, NULL, 9, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'DOCUMENTO_SOCIOS', 'Documento dos Sócios', 'RG, CPF ou CNH dos sócios/administradores', 'SOCIETARIO', true, 365, 10, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'CERTIDAO_NEGATIVA', 'Certidão Negativa', 'CND federal, estadual ou municipal', 'FISCAL', true, 30, 11, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'BALANCO_PATRIMONIAL', 'Balanço Patrimonial', 'Balanço patrimonial e demonstrações contábeis', 'FISCAL', false, NULL, 12, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'DECLARACAO_IRPJ', 'Declaração IRPJ/CSLL', 'Declaração de Imposto de Renda Pessoa Jurídica', 'FISCAL', false, NULL, 13, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'GUIA_FGTS', 'Guia FGTS', 'Guia de recolhimento FGTS (GRF/GRRF)', 'TRABALHISTA', false, NULL, 14, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'FOLHA_PAGAMENTO', 'Folha de Pagamento', 'Resumo da folha de pagamento mensal', 'TRABALHISTA', false, NULL, 15, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'OUTRO', 'Outro Documento', 'Documentos não classificados nas demais categorias', 'OUTRO', false, NULL, 99, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
