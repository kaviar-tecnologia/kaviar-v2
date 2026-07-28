# Runbook Operacional — Modo Sombra da Gratificação Anual KAVIAR

**Versão:** 1.0
**Data:** 2026-07-28
**Etapa:** 2C.4C — Prontidão operacional

---

## A. Objetivo

O **modo sombra** grava direitos reais de gratificação anual no ledger imutável (`annual_incentive_ledger`), baseado em 10% da taxa KAVIAR efetivamente consumida, **sem exibir nem pagar ao motorista**.

O propósito é validar o sistema de cálculo, idempotência e atomicidade em produção antes de ativar a visibilidade e o pagamento.

**O que o modo sombra faz:**
- Calcula o direito de gratificação para cada evento de taxa consumida
- Grava o accrual no ledger imutável
- Permite reconciliação e verificação contínua

**O que o modo sombra NÃO faz:**
- Não exibe saldo ao motorista
- Não permite saque
- Não executa pagamento
- Não altera a carteira visível

---

## B. Pré-requisitos

Antes de ativar o modo sombra em qualquer ambiente, confirme:

- [ ] Commit aprovado e mergeado na branch alvo
- [ ] Migrations existentes aplicadas (`npx prisma migrate deploy`)
- [ ] Trigger `annual_incentive_ledger_immutable_trg` habilitado (estado `O`)
- [ ] Reconciliador (`reconcile-annual-incentive-shadow.ts`) executa sem divergências
- [ ] Serviço de prontidão (`check-annual-incentive-shadow-readiness.ts`) retorna `READY_TO_ENABLE_SHADOW`
- [ ] Zero blockers no relatório de prontidão
- [ ] Backup/PITR do banco confirmado pelo operador de infraestrutura
- [ ] Logs acessíveis e monitoramento ativo
- [ ] Responsável técnico definido e disponível durante a janela de ativação
- [ ] Janela de observação definida (mínimo recomendado: 24 horas)
- [ ] Ambiente de produção sem deploys simultâneos
- [ ] Comunicação prévia à equipe financeira

---

## C. Ordem Correta de Ativação

> ⚠️ **NUNCA ativar SHADOW=true enquanto WRITE=false.**
> Essa combinação é inválida e será reportada como `INVALID_CONFIGURATION`.

**Fonte operacional das flags:** variáveis de ambiente do processo/serviço (`process.env`).

A tabela `feature_flags` **não** controla o comportamento operacional. Não edite a tabela para ativar/desativar o modo sombra.

### Sequência:

```
1. Definir ANNUAL_INCENTIVE_WRITE_ENABLED=true nas variáveis de ambiente do serviço
2. Aplicar/reiniciar o serviço para que a variável tenha efeito
3. Confirmar que o serviço está saudável (healthcheck, logs)
4. Definir ANNUAL_INCENTIVE_SHADOW_ENABLED=true nas variáveis de ambiente
5. Aplicar/reiniciar o serviço novamente
6. Confirmar que a configuração é SHADOW_ACTIVE via readiness
7. Executar reconciliador: zero divergências
```

### Verificação pós-ativação imediata:

```bash
DATABASE_URL='<LOCAL_OR_APPROVED_DATABASE_URL>' \
npx tsx src/scripts/check-annual-incentive-shadow-readiness.ts \
  --format human \
  --fail-on-not-ready
```

Código de saída esperado: `0` (READY ou HEALTHY).

---

## D. Ordem Correta de Desativação (Rollback)

```
1. Definir ANNUAL_INCENTIVE_SHADOW_ENABLED=false nas variáveis de ambiente
2. Aplicar/reiniciar o serviço para que a mudança tenha efeito
3. Confirmar que novos accruals automáticos pararam
4. Executar readiness e reconciliador para conferir estado final
5. Somente depois definir ANNUAL_INCENTIVE_WRITE_ENABLED=false
6. Aplicar/reiniciar o serviço
```

> Manter WRITE=true temporariamente após desligar SHADOW evita configuração inválida transitória e permite que eventos em processamento concluam corretamente.

---

## E. Critérios de Rollback Imediato

Executar rollback (seção D) imediatamente se qualquer uma destas condições for detectada:

- Configuração inválida (`SHADOW=true, WRITE=false`)
- Qualquer accrual duplicado
- Accrual órfão (sem evento wallet correspondente)
- Valor de accrual incorreto (mismatch)
- Diferença financeira (`differenceCents ≠ 0`)
- Trigger desabilitado (estado ≠ `O`)
- Falha repetida no fluxo de settlement
- Aumento anormal de erros nos logs
- Incapacidade de executar reconciliação
- Banco ou estrutura divergente do esperado
- Qualquer blocker reportado pelo serviço de prontidão

---

## F. O que o Rollback Faz (e NÃO Faz)

**Faz:**
- Impede que novos accruals automáticos sejam gravados
- Retorna o sistema ao estado pré-ativação funcional

**NÃO faz:**
- Não apaga accruals existentes (imutabilidade do ledger)
- Não altera saldo da carteira
- Não exclui histórico
- Não executa correções automáticas

> Eventos já gravados no `annual_incentive_ledger` permanecem para auditoria e conferência posterior. O trigger de imutabilidade impede exclusão.

---

## G. Comandos de Verificação

### Prontidão (readiness)

```bash
DATABASE_URL='<LOCAL_OR_APPROVED_DATABASE_URL>' \
npx tsx src/scripts/check-annual-incentive-shadow-readiness.ts \
  --format human \
  --fail-on-not-ready
```

### Prontidão em JSON

```bash
DATABASE_URL='<LOCAL_OR_APPROVED_DATABASE_URL>' \
npx tsx src/scripts/check-annual-incentive-shadow-readiness.ts \
  --format json \
  --fail-on-not-ready
```

### Reconciliação

```bash
DATABASE_URL='<LOCAL_OR_APPROVED_DATABASE_URL>' \
npx tsx src/scripts/reconcile-annual-incentive-shadow.ts \
  --format human \
  --fail-on-divergence
```

### Reconciliação por motorista

```bash
DATABASE_URL='<LOCAL_OR_APPROVED_DATABASE_URL>' \
npx tsx src/scripts/reconcile-annual-incentive-shadow.ts \
  --driver-id <DRIVER_ID> \
  --format json
```

### Verificar trigger

```sql
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'annual_incentive_ledger_immutable_trg';
-- Esperado: tgenabled = 'O'
```

### Códigos de saída do readiness

| Código | Significado |
|--------|-------------|
| `0` | `READY_TO_ENABLE_SHADOW` ou `SHADOW_ACTIVE_HEALTHY` |
| `1` | Erro de argumento, configuração técnica ou SQL |
| `2` | `NOT_READY`, `INVALID_CONFIGURATION` ou `SHADOW_ACTIVE_DEGRADED` com blocker |
| `3` | `INSUFFICIENT_TRAFFIC` sem blocker |

---

## H. Monitoramento Após Ativação

### Cronograma de verificação

| Janela | Ação |
|--------|------|
| T+5 minutos | Readiness + reconciliador + logs de erro |
| T+30 minutos | Readiness + reconciliador + contagem de eventos + cobertura |
| T+2 horas | Readiness + reconciliador + diferença + pendências |
| T+24 horas | Readiness completo + reconciliador + contagem total + trigger |

### Em cada janela, verificar:

1. **Readiness:** resultado geral (HEALTHY, DEGRADED, etc.)
2. **Reconciliador:** zero divergências críticas
3. **Contagem de eventos:** `walletEventCount` compatível com tráfego esperado
4. **Cobertura:** `coverageBasisPoints = 10000` (100%)
5. **Diferença:** `differenceCents = 0`
6. **Erros:** nenhum erro novo em logs
7. **Pendências:** nenhuma pendência > 24h
8. **Trigger:** estado `O` (habilitado)

### Comando sugerido para monitoramento

```bash
DATABASE_URL='<LOCAL_OR_APPROVED_DATABASE_URL>' \
npx tsx src/scripts/check-annual-incentive-shadow-readiness.ts \
  --window-hours 2 \
  --format json \
  --fail-on-not-ready
```

---

## I. Limitações Atuais

| Limitação | Impacto | Quando será resolvida |
|-----------|---------|----------------------|
| Flags globais | Não é possível ativar para um subconjunto de motoristas | Etapa futura: escopo por coorte ou cidade |
| Sem coorte/rollout gradual | Ativação é tudo-ou-nada | Etapa futura |
| Sem frontend | Motorista não vê saldo de gratificação | Etapa futura: tela de benefícios |
| Sem saque | Motorista não pode solicitar pagamento | Etapa futura: fluxo de saque |
| Sem pagamento | Nenhum valor é transferido ao motorista | Etapa futura: integração bancária |
| Legado coexistindo | `family_return_accruals` continua operando | Descontinuação em etapa futura |
| Fee split pós-commit | Divisão de taxa não é atômica com accrual | Monitorar; reconciliação territorial futura |
| Territory ledger pós-commit | Contabilidade territorial não atômica | Monitorar; reconciliação territorial futura |
| Reversão não implementada | Reversões detectadas mas não tratadas operacionalmente | Etapa futura: fluxo de reversão |

> **Nota importante:** Uma ativação gradual real (por motorista, cidade ou percentual de tráfego) exigirá uma etapa futura de escopo por coorte. As flags atuais são booleanas globais.

---

## J. Responsabilidades

| Papel | Responsabilidade |
|-------|-----------------|
| Responsável técnico | Ativação, monitoramento, execução de rollback técnico |
| Responsável financeiro | Conferência de valores, aprovação de ativação |
| Responsável pela decisão de rollback | Autorizar rollback em caso de critério atingido |
| Responsável pela conferência contábil | Validar que accruals registrados correspondem à regra de negócio |

> Não atribuir nomes pessoais neste documento. Definir pessoas em comunicação interna antes da ativação.

---

## Apêndice: Política Vigente

| Parâmetro | Valor |
|-----------|-------|
| Percentual de gratificação | 10% da taxa KAVIAR consumida |
| Versão da política | `ANNUAL-INCENTIVE-v1` |
| Programa anual | Ano civil em `America/Sao_Paulo` |
| Ledger | `annual_incentive_ledger` |
| Imutabilidade | Trigger `annual_incentive_ledger_immutable_trg` |
| Idempotência | Constraint UNIQUE em `idempotency_key` |
| Formato de valores | Centavos (bigint) — sem ponto flutuante |
| Cobertura | Basis points (10000 = 100%) |
