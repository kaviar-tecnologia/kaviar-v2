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

## Dados apresentados

### Fontes de dados

- **Dados operacionais** (status, datas, motorista, passageiro): tabela `rides_v2`
- **Valores financeiros finais** (preço, taxa, ganho motorista): tabela `ride_settlements`, **somente quando liquidados** (`settled_at IS NOT NULL`)

### financial_status

Cada corrida na listagem recebe um status financeiro explícito:

| Status | Condição | Valores exibidos? |
|--------|----------|-------------------|
| `SETTLED` | Settlement existe e `settled_at IS NOT NULL` | ✅ Sim — valores finais |
| `UNSETTLED` | Settlement existe, `settled_at IS NULL` | ❌ Não — retornados como null |
| `UNAVAILABLE` | Settlement não existe | ❌ Não — retornados como null |

**Valores não liquidados nunca são apresentados como finais ao contador.**

### Resumo do período

- Quantidade total de corridas (operacional)
- Corridas concluídas (operacional)
- Corridas canceladas (operacional)
- Valor bruto: soma de `final_price` **apenas de settlements liquidados**
- Taxa KAVIAR: soma de `fee_amount` **apenas de settlements liquidados**
- Valor motoristas: soma de `driver_earnings` **apenas de settlements liquidados**

### Listagem por corrida

- Data de criação (UTC)
- ID (referência técnica para auditoria)
- Motorista (nome completo da tabela `drivers.name`)
- Passageiro (**somente primeiro nome** — `split_part(btrim(p.name), ' ', 1)`)
- Território de liquidação
- Valor bruto (somente se SETTLED)
- Taxa plataforma % e R$ (somente se SETTLED)
- Valor motorista (somente se SETTLED)
- Status operacional
- Status financeiro (SETTLED/UNSETTLED/UNAVAILABLE)

### Filtros

- Data inicial / Data final (formato estrito YYYY-MM-DD, máx. 90 dias, UTC)
- Status da corrida
- Território
- Busca por ID ou nome do motorista

## Critérios dos valores

- **Fonte de verdade**: `ride_settlements` com `settled_at IS NOT NULL`
- **Sem recálculo**: `fee_percent`, `fee_amount`, `driver_earnings` são históricos — não sobrescritos pela taxa atual
- **Formato armazenamento**: `fee_percent` = `DECIMAL(5,2)`, valores monetários = `DECIMAL(8,2)`
- **Serialização**: strings decimais exatas (ex: `"50.00"`, `"9.00"`) — **sem float/Number**
- **Formatação frontend**: string-only sem parseFloat (`"1234.50"` → `"R$ 1.234,50"`)
- **Valores ausentes/não liquidados**: retornados como `null`, nunca estimados

## Limitações (V1)

- Listagem inclui todas as corridas no período (LEFT JOIN com settlements), mas valores financeiros só aparecem para SETTLED
- Máximo de 90 dias por consulta
- Máximo de 200 linhas por página (API)
- Exportação CSV: **recusa** com HTTP 422 quando total > 5000 linhas (não trunca silenciosamente)
- Nome do passageiro limitado ao primeiro nome (proteção de dados)
- Sem dashboard de tendência/gráficos
- Sem filtro por motorista individual com autocomplete
- Sem integração com sistema contábil externo

## Comportamento do CSV

- Encoding: UTF-8 com BOM (compatível com Excel)
- Separador: vírgula
- Cabeçalhos em português (inclui "Status Financeiro")
- Valores monetários: formato string exato `"0.00"` (ponto decimal)
- Datas em formato `DD/MM/AAAA HH:MM` (UTC)
- Nome do arquivo: `kaviar-relatorio-contador-YYYY-MM-DD-a-YYYY-MM-DD.csv`
- **Proteção CSV injection**: campos iniciados por `=`, `+`, `-`, `@`, `\t`, `\r` recebem prefixo `'`
- **Limite**: > 5000 linhas retorna HTTP 422 com JSON de erro (código `CSV_ROW_LIMIT_EXCEEDED`)

## Confirmação de somente leitura

- Nenhuma operação INSERT/UPDATE/DELETE
- Nenhuma chamada a Prisma write
- Nenhuma ativação de provider financeiro (Pix, Asaas, SumUp)
- Nenhuma schema migration
- Nenhum deploy

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/finance/accountant-report` | Resumo + listagem paginada |
| GET | `/api/admin/finance/accountant-report/csv` | Exportação CSV (ou 422 se > 5000) |

## Tela frontend

| Rota | Componente |
|------|-----------|
| `/admin/financeiro/contador` | `AccountantReportPage.jsx` |

## Itens futuros (exigiriam schema, migration ou provider)

- Dashboard com gráficos e tendência (pode ser feito sem migration, apenas frontend)
- Filtro por motorista individual com autocomplete (requer endpoint de busca)
- Exportação contábil formatada (OFX/XML) — requer decisão contábil
- Integração com sistema de obrigações (requer `financial_obligations` ativo)
- Repasses automatizados (requer provider Pix/Asaas ativo)
- Exibir diferença entre valores provisórios e liquidados para corridas UNSETTLED
