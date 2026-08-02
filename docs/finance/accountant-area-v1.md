# Área do Contador V1

## Finalidade

Painel somente leitura que permite ao perfil FINANCE (contador) consultar dados financeiros de corridas,
visualizar resumos de valores liquidados e exportar relatórios CSV para conciliação contábil externa.

Não há ações de escrita, pagamento, estorno, liquidação ou ajuste nesta versão.

## Perfis autorizados

| Role | Acesso |
|------|--------|
| `SUPER_ADMIN` | ✅ Acesso total |
| `FINANCE` | ✅ Acesso total (leitura) |
| Outros | ❌ Bloqueado (403) |

## Integridade Financeira (fail-closed)

O relatório opera em modo **fail-closed**:

- Dados financeiros de settlements liquidados (`settled_at IS NOT NULL`) são **obrigatórios e validados**.
- Se qualquer valor (`final_price`, `fee_percent`, `fee_amount`, `driver_earnings`) estiver ausente ou em formato inválido para um settlement liquidado, o relatório é **bloqueado** com HTTP 500 e código `FINANCIAL_DATA_INVALID`.
- **Nenhum valor inválido é convertido silenciosamente para zero.**
- Zero legítimo vindo do PostgreSQL (`0`, `0.00`) é normalizado para `"0.00"`.
- Valores com mais de 2 casas decimais são rejeitados (sem arredondamento).

## Dados apresentados

### Fontes de dados

- **Dados operacionais** (status, datas, motorista, passageiro): tabela `rides_v2`
- **Valores financeiros finais**: tabela `ride_settlements`, **somente quando liquidados** (`settled_at IS NOT NULL`)

### financial_status

| Status | Condição | Valores exibidos? |
|--------|----------|-------------------|
| `SETTLED` | Settlement existe e `settled_at IS NOT NULL` | ✅ Validados e exibidos |
| `UNSETTLED` | Settlement existe, `settled_at IS NULL` | ❌ null |
| `UNAVAILABLE` | Settlement não existe | ❌ null |

### Resumo do período

Totais financeiros somam **apenas settlements liquidados** (`settled_at IS NOT NULL`).
Os totais são validados com `requireFinancialDecimal` — nunca retornados como fallback `"0.00"` para dados inválidos.

### Listagem

- Operacional: todas as corridas no período (LEFT JOIN)
- Financeiro: apenas SETTLED mostra valores
- Passageiro: **somente primeiro nome** (`split_part`)
- Ordenação determinística: `created_at DESC, id DESC`

## Formato dos valores

- `fee_percent`: `DECIMAL(5,2)` → serializado como string exata (ex: `"18.00"`)
- Valores monetários: `DECIMAL(8,2)` → serializado como string exata (ex: `"50.00"`)
- Serialização: **string-only**, sem `parseFloat`, sem `Number`, sem cálculos float
- Frontend formatter: manipulação de string (`"1234.50"` → `"R$ 1.234,50"`)

## CSV

- **Uma única fotografia SQL** (CTE com `COUNT(*) OVER()` e `LIMIT 5001`)
- Se total > 5000: retorna HTTP 422 com JSON de erro (`CSV_ROW_LIMIT_EXCEEDED`)
- **Não produz relatório parcial** — é tudo ou nada
- Encoding: UTF-8 com BOM
- Proteção CSV injection: `=`, `+`, `-`, `@`, `\t`, `\r` → prefixo `'`
- Cabeçalhos em português (inclui "Status Financeiro")
- Conjunto vazio: CSV apenas com cabeçalhos

## Limitações (V1)

- Máximo 90 dias por consulta (validação estrita YYYY-MM-DD UTC)
- Máximo 200 linhas por página
- CSV limitado a 5.000 linhas (sem truncamento — recusa se exceder)
- Nome do passageiro limitado ao primeiro nome
- Sem gráficos/tendência
- Sem filtro por motorista individual com autocomplete
- Merge do PR não está autorizado por esta tarefa

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/finance/accountant-report` | Resumo + listagem paginada |
| GET | `/api/admin/finance/accountant-report/csv` | CSV ou 422 se > 5000 |

## Tela frontend

| Rota | Componente |
|------|-----------|
| `/admin/financeiro/contador` | `AccountantReportPage.jsx` |

## Confirmação de somente leitura

- Nenhuma operação INSERT/UPDATE/DELETE
- Nenhuma ativação de provider financeiro
- Nenhuma schema migration
- Nenhum deploy

## Itens futuros (exigiriam schema, migration ou provider)

- Dashboard com gráficos
- Filtro por motorista com autocomplete
- Exportação OFX/XML
- Integração com sistema de obrigações
- Repasses automatizados
