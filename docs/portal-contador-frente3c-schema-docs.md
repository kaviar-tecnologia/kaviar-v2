# Frente 3C — Accounting Documents Schema

**Status**: Aprovado. Pronto para implementação de endpoints.  
**Migration**: `20260805080000_add_accounting_documents`  
**Branch**: `feat/accounting-portal-documents`

---

## 1. Regra do Arquivo Atual (Current File Derivation)

O arquivo atual de um documento é derivado em tempo de query — **não há coluna `current_file_id`**.

### Invariante

```sql
-- Arquivo atual = maior version_number onde:
-- 1. Pertence ao documento
-- 2. scan_status ≠ 'INFECTED'
-- 3. Registro existe (existência = upload confirmado)

SELECT * FROM accounting_company_document_files
WHERE document_id = :doc_id
  AND scan_status != 'INFECTED'
ORDER BY version_number DESC
LIMIT 1;
```

### Justificativa

- **Existência do registro = upload confirmado.** O registro só é criado APÓS o upload concluir com sucesso no S3 (presigned URL callback ou confirmation endpoint).
- **Não há status de "upload em progresso"** — se o upload falhar, o registro não é criado.
- **INFECTED é o único filtro** porque:
  - NOT_SCANNED: permitido (MVP sem scanner)
  - PENDING: em análise, mas acessível
  - CLEAN: OK
  - FAILED: decisão futura, conservador mas não bloqueante no MVP
- **Não filtra por document.status** — status do documento é independente do acesso ao arquivo.
- **Não filtra por REPLACED/REVOKED** — esses são estados do documento, não do arquivo.

### Query para "Há arquivo disponível?"

```typescript
// Prisma
const currentFile = await prisma.accounting_company_document_files.findFirst({
  where: { 
    document_id: docId,
    scan_status: { not: 'INFECTED' }
  },
  orderBy: { version_number: 'desc' }
});
```

---

## 2. Constraint do Autor (Upload Actor XOR)

### CHECK Constraint

```sql
CONSTRAINT "accounting_company_document_files_has_uploader" CHECK (
  ("uploaded_by_admin_id" IS NOT NULL AND "uploaded_by_accountant_id" IS NULL)
  OR
  ("uploaded_by_admin_id" IS NULL AND "uploaded_by_accountant_id" IS NOT NULL)
)
```

### Comportamento

| admin_id | accountant_id | Resultado |
|----------|---------------|-----------|
| ✓        | NULL          | ✅ Válido  |
| NULL     | ✓             | ✅ Válido  |
| ✓        | ✓             | ❌ Rejeitado (CHECK violation) |
| NULL     | NULL          | ❌ Rejeitado (CHECK violation) |

### Nota sobre uploads de sistema

Se no futuro houver necessidade de uploads automatizados (sistema/batch), será adicionada via migration explícita:
- Opção A: campo `uploaded_by_system BOOLEAN DEFAULT false` + ajuste no CHECK
- Opção B: coluna `uploaded_by_system_actor VARCHAR(50)` com CHECK `exactly_one_of(admin, accountant, system_actor)`

---

## 3. Scan Status

### Valores

| Valor          | Semântica                                  | Download permitido |
|----------------|--------------------------------------------|--------------------|
| `NOT_SCANNED`  | Default MVP, scanner não implementado      | ✅ Sim              |
| `PENDING`      | Enviado para scanner, aguardando resultado | ✅ Sim (otimista)   |
| `CLEAN`        | Scanner confirmou seguro                   | ✅ Sim              |
| `INFECTED`     | Scanner detectou ameaça                    | ❌ Bloqueado        |
| `FAILED`       | Scanner falhou (timeout, erro)             | ⚠️ Decisão futura  |

### Política MVP

- Default: `NOT_SCANNED`
- Scanner: **não implementado**
- Acesso: apenas `INFECTED` bloqueia download
- Futuro: integração com ClamAV/AWS Macie via SNS ou Step Functions

---

## 4. Document Status (Enum Operacional)

### Valores finais

```
DRAFT → SENT → UNDER_REVIEW → APPROVED → ACTIVE
                             → REJECTED
                                        → REPLACED
                                        → REVOKED
```

### Transições válidas

| De             | Para           | Ação                                      |
|----------------|----------------|-------------------------------------------|
| `DRAFT`        | `SENT`         | Contador envia para revisão               |
| `SENT`         | `UNDER_REVIEW` | Admin inicia análise                      |
| `UNDER_REVIEW` | `APPROVED`     | Admin aprova                              |
| `UNDER_REVIEW` | `REJECTED`     | Admin rejeita (com motivo)                |
| `APPROVED`     | `ACTIVE`       | Documento entra em vigor                  |
| `ACTIVE`       | `REPLACED`     | Novo documento substitui este             |
| `ACTIVE`       | `REVOKED`      | Revogação manual (erro, fraude, judicial) |
| `REJECTED`     | `DRAFT`        | Contador corrige e tenta novamente        |

### Status que NÃO existem no enum

- `EXPIRED`: derivado de `expires_at`
- `PENDING`: ambíguo, usar DRAFT ou SENT
- `ARCHIVED`: usar REPLACED ou REVOKED

### Necessidade de cada valor

| Status         | Necessário? | Justificativa                                        |
|----------------|-------------|------------------------------------------------------|
| `DRAFT`        | ✅           | Documento criado mas não enviado                    |
| `SENT`         | ✅           | Diferencia "pronto para revisão" de "em rascunho"   |
| `UNDER_REVIEW` | ✅           | Admin está analisando (evita reenvio)               |
| `APPROVED`     | ✅           | Aprovado mas pode não estar vigente ainda           |
| `ACTIVE`       | ✅           | Em vigor (fonte da verdade)                         |
| `REJECTED`     | ✅           | Feedback explícito ao contador                      |
| `REPLACED`     | ✅           | Histórico preservado, novo doc ativo                |
| `REVOKED`      | ✅           | Remoção administrativa com auditoria                |

---

## 5. Situação Temporal (Derivada)

**Não persiste em banco.** Calculada em tempo de query/serialização:

```typescript
function getTemporalStatus(doc: { expires_at: Date | null }, renewalAlertDays: number | null): string {
  if (!doc.expires_at) return 'NO_EXPIRY';
  
  const now = new Date();
  const expiresAt = new Date(doc.expires_at);
  
  if (expiresAt < now) return 'EXPIRED';
  
  const alertDays = renewalAlertDays ?? 30;
  const alertDate = new Date(expiresAt.getTime() - alertDays * 24 * 60 * 60 * 1000);
  
  if (now >= alertDate) return 'EXPIRING_SOON';
  return 'VALID';
}
```

### Valores

| Valor           | Condição                                    |
|-----------------|---------------------------------------------|
| `NO_EXPIRY`     | `expires_at IS NULL`                        |
| `VALID`         | `expires_at > NOW() + renewal_alert_days`   |
| `EXPIRING_SOON` | `expires_at` dentro do período de alerta    |
| `EXPIRED`       | `expires_at < NOW()`                        |

---

## 6. Índices

### accounting_document_types (3 índices + 1 PK + 1 UNIQUE)

| Índice | Colunas | Justificativa |
|--------|---------|---------------|
| PK | `id` | — |
| UNIQUE | `code` | Imutável após criação |
| `idx_doc_types_category` | `category` | Filtro por categoria no catálogo |
| `idx_doc_types_active_sort` | `is_active, sort_order` | Listagem ordenada de tipos ativos |

### accounting_company_documents (6 índices + 1 PK)

| Índice | Colunas | Justificativa |
|--------|---------|---------------|
| PK | `id` | — |
| `idx_company_docs_entity` | `legal_entity_id` | Docs por empresa |
| `idx_company_docs_type` | `document_type_id` | Docs por tipo |
| `idx_company_docs_entity_type` | `legal_entity_id, document_type_id` | Covering para "empresa tem tipo X?" |
| `idx_company_docs_status` | `status` | Filtro por status |
| `idx_company_docs_expires` | `expires_at` WHERE NOT NULL | Partial: apenas documentos com validade |
| `idx_company_docs_entity_status` | `legal_entity_id, status` | Dashboard: docs ativos por empresa |

### accounting_company_document_files (2 índices + 1 PK + 2 UNIQUE)

| Índice | Colunas | Justificativa |
|--------|---------|---------------|
| PK | `id` | — |
| UNIQUE | `document_id, version_number` | Garante unicidade de versão por doc |
| UNIQUE | `storage_key` | Garante unicidade de chave S3 |
| `idx_doc_files_document` | `document_id` | FK lookup, derivação de current file |
| `idx_doc_files_sha256` | `sha256` | Detecção de duplicatas |

### Nota sobre redundância

- `idx_company_docs_entity` é "redundante" com `idx_company_docs_entity_type` e `idx_company_docs_entity_status` para prefix scans, mas mantido por clareza e porque Postgres otimiza diferentemente single-column vs composite.
- `idx_doc_files_document` é "redundante" com UNIQUE `(document_id, version_number)` para prefix scans, mas mantido explicitamente para o ORDER BY version_number DESC na derivação do current file.

---

## 7. Constraints Testados

| # | Cenário | Resultado |
|---|---------|-----------|
| 1 | storage_key duplicada | ❌ Rejeitada (UNIQUE) |
| 2 | version_number duplicada no mesmo doc | ❌ Rejeitada (UNIQUE composite) |
| 3 | Mesmo version_number em docs diferentes | ✅ Permitido |
| 4 | Dois autores preenchidos | ❌ Rejeitado (CHECK XOR) |
| 5 | Nenhum autor preenchido | ❌ Rejeitado (CHECK XOR) |
| 6 | FK empresa inválida | ❌ Rejeitada (FOREIGN KEY) |
| 7 | FK tipo inválida | ❌ Rejeitada (FOREIGN KEY) |
| 8 | DELETE documento com arquivos | ❌ Bloqueado (RESTRICT) |
| 9 | DELETE tipo em uso | ❌ Bloqueado (RESTRICT) |
| 10 | DELETE empresa com documentos | ❌ Bloqueado (RESTRICT) |

---

## 8. Validação Final

| Etapa | Resultado |
|-------|-----------|
| `prisma validate` | ✅ |
| `prisma generate` | ✅ |
| `tsc --noEmit` | ✅ |
| `git diff --check` | ✅ |
| `prisma migrate deploy` (DB limpo com histórico real) | ✅ |
| 10 constraint tests em PostgreSQL real | ✅ |

---

## 9. Recomendação

**Schema aprovado para iniciar implementação de endpoints e S3.**

Não há bloqueadores objetivos. Próximos passos:
1. Merge PR (draft → ready)
2. Deploy migration em produção
3. Implementar endpoints CRUD + presigned URL
4. Implementar frontend de documentos
