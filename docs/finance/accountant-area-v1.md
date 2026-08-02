# Área do Contador V1

## Finalidade

Painel somente leitura que permite ao perfil FINANCE (contador) consultar dados financeiros de corridas,
visualizar resumos e exportar relatórios CSV para conciliação contábil externa.

Não há ações de escrita, pagamento, estorno, liquidação ou ajuste nesta versão.

## Perfis autorizados

| Role | Acesso |
|------|--------|
| `SUPER_ADMIN` | ✅ Acesso total |
| `FINANCE` | ✅ Acesso total (leitura) |
| Outros | ❌ Bloqueado (403) |

## Dados apresentados

### Resumo do período
- Quantidade total de corridas
- Corridas concluídas
- Corridas canceladas
- Valor bruto (soma de `final_price` de corridas concluídas)
- Taxa KAVIAR (soma de `fee_amount`)
- Valor destinado aos motoristas (soma de `driver_earnings`)

### Listagem por corrida
- Data de criação
- ID (referência técnica)
- Motorista (nome)
- Passageiro (primeiro nome)
- Território de liquidação
- Valor bruto
- Taxa da plataforma (% e R$)
- Valor do motorista
- Status operacional
- Data de liquidação

### Filtros
- Data inicial / Data final (máx. 90 dias)
- Status da corrida
- Território
- Busca por ID ou nome de motorista

## Critérios dos valores

- **Fonte de verdade**: tabela `ride_settlements` (persistida no momento da liquidação)
- **Sem recálculo**: valores `fee_percent`, `fee_amount`, `driver_earnings` são históricos — não são sobrescritos pela taxa atual
- **Formato**: `Decimal(8,2)` — nunca float
- **Valores ausentes**: retornados como `null`, nunca estimados

## Limitações (V1)

- Não exibe valores pendentes de liquidação (apenas corridas com `ride_settlements`)
- Máximo de 90 dias por consulta
- Máximo de 200 linhas por página (API), 5000 linhas no CSV
- Sem dashboard de tendência/gráficos
- Sem filtro por motorista individual
- Sem detalhamento de créditos consumidos por tipo
- Sem integração com sistema contábil externo

## Comportamento do CSV

- Encoding: UTF-8 com BOM (compatível com Excel)
- Separador: vírgula
- Cabeçalhos em português
- Valores monetários em formato `0.00` (ponto decimal)
- Datas em formato `DD/MM/AAAA HH:MM`
- Nome do arquivo: `kaviar-relatorio-contador-YYYY-MM-DD-a-YYYY-MM-DD.csv`
- **Proteção CSV injection**: campos iniciados por `=`, `+`, `-`, `@` recebem prefixo `'`

## Confirmação de somente leitura

- Nenhuma operação INSERT/UPDATE/DELETE no endpoint
- Nenhuma chamada a Prisma write
- Nenhuma ativação de provider financeiro (Pix, Asaas, SumUp)
- Nenhuma schema migration
- Nenhum deploy

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/finance/accountant-report` | Resumo + listagem paginada |
| GET | `/api/admin/finance/accountant-report/csv` | Exportação CSV |

## Tela frontend

| Rota | Componente |
|------|-----------|
| `/admin/financeiro/contador` | `AccountantReportPage.jsx` |

## Itens futuros (exigiriam schema, migration ou provider)

- Exibir liquidação pendente (requer modelo de fila de settlement)
- Dashboard com gráficos e tendência (pode ser feito sem migration, apenas frontend)
- Filtro por motorista individual com autocomplete (requer endpoint de busca)
- Exportação contábil formatada (OFX/XML) — requer decisão contábil
- Integração com sistema de obrigações (requer `financial_obligations` ativo)
- Repasses automatizados (requer provider Pix/Asaas ativo)
