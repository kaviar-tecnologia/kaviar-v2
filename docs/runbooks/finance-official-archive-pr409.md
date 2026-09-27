# PR #409 — cofre privado para arquivos declarados (sem autenticar origem)

Não há extratos oficiais reais anexados ou obtidos nesta entrega. Os testes usam
somente dados e PDFs/CSVs de fantasia. O próximo passo depois desta base é
homologação controlada com amostras oficiais e autorização específica.

## Distinções obrigatórias
- `RESERVED`: metadados de arquivo e auditoria gravados ANTES do S3.
  Uma falha no upload ou na confirmação posterior preserva a reserva para
  reconciliação operacional, sem fingir que um arquivo existe.
- `STORED_UNVERIFIED`: o backend verificou atributos S3, SSE-KMS e readback
  comparando SHA-256 dos bytes. Isso prova somente integridade naquele momento.
- `source_verification=UNVERIFIED` é imutável por CHECK no SQL nesta fase.
  `PROVIDER_PORTAL_DECLARED` e `EMAIL_ATTACHMENT_DECLARED` são declarações
  do administrador — NÃO autenticação da SumUp ou Asaas.
- Nenhum dado de extrato gera crédito, receita, saldo, pagamento, lançamento,
  atestação de faturamento zero ou fechamento financeiro.

## API desativada por padrão
`POST /api/admin/finance/monthly-close/evidence/official-archive`:
multipart `file` + `legal_entity_id`, `account_id`, `provider`, `year`,
`month`, `declared_source_channel`. Somente SUPER_ADMIN. PDF/CSV até 5 MiB,
validação preliminar de extensão e bytes; NÃO interpreta layout nativo.

`GET /api/admin/finance/monthly-close/evidence/official-archive`:
somente metadados filtrados por CNPJ/competência, nunca devolve bucket, key,
bytes nem URL de acesso. Não existe endpoint de download nesta fase: antes,
é necessária política de varredura antivírus e visualização segura.

## Ativação futura requer aprovação operacional específica
- `FINANCE_OFFICIAL_ARCHIVE_ENABLED=true` — manter **false** nesta entrega;
- `FINANCE_EVIDENCE_BUCKET` dedicado e diferente de uploads comuns;
- `FINANCE_EVIDENCE_KMS_KEY_ARN` da CMK dedicada, IAM least privilege;
- configurar no AWS: Block Public Access, versionamento/Object Lock/retenção
  conforme política LGPD aprovada, alertas, orçamento, política KMS e malware
  scanning. O código exige SSE-KMS e hash mas NÃO provisiona infraestrutura.

Uma reserva presa precisa de reconciliação manual do objeto e do registro
auditado; não deletar ou sobrescrever o arquivo. Não habilitar sem rotina de
recuperação e revisão das amostras reais. Arquivo não deve ser servido ao
cliente antes da varredura de segurança.

## CI, migration e produção
Prisma schema e SQL de migration estão preparados para revisão; CI faz
`db push` somente em PostgreSQL descartável e usa armazenamento falso in-memory,
sem comunicação com AWS. Nenhum merge implica deploy de produção, alterações
no RDS, mudança de flags ou upload de documento real. Homologar a migration
SQL à parte, em banco descartável, antes da execução em produção.
