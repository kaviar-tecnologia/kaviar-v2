-- Correct KAVIAR institutional phone: add missing digit 9
UPDATE "legal_entities"
SET
  "telefone_institucional" = '(21) 96864-8777',
  "whatsapp_institucional" = '+55 21 96864-8777',
  "updated_at" = NOW()
WHERE "cnpj" = '67783601000199';
