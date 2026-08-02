# Accountant Area — Production Rollout Plan

## Commit-alvo

O deploy coordenado deve usar o SHA completo da `main` no momento da execução.
Atualmente: `30f0761bb58f4d41a5eeb293113065836f0aaed9`

## Ordem obrigatória: Backend → Frontend

1. Backend workflow executado e concluído com sucesso
2. ECS estável (desired=running, pending=0, 1 deployment)
3. Health check HTTP 200 com versão correta
4. Rota `/api/admin/finance/accountant-report` retorna 401/403 (existe)
5. Ausência de erros críticos nos logs
6. **Somente então** frontend workflow pode ser executado manualmente

Não há disparo automático do frontend pelo backend.

## Confirmações exigidas

| Workflow | Confirmação | SHA |
|----------|------------|-----|
| Backend | `DEPLOY_PRODUCTION` | 40 chars hex lowercase, HEAD atual da main |
| Frontend | `DEPLOY_FRONTEND_PRODUCTION` | 40 chars hex lowercase, HEAD atual da main |

## Critérios de segurança do ECS (pré-deploy)

O backend bloqueia com `PRODUCTION_SERVICE_NOT_SAFE_FOR_ROLLING_DEPLOY` se:

- desiredCount < 1
- runningCount ≠ desiredCount
- pendingCount ≠ 0
- deployments ≠ 1
- minimumHealthyPercent < 100
- maximumPercent < 200

Configuração atual: minHealthy=100, maxPercent=200, circuitBreaker com rollback ativo.

## Critérios de saúde pós-deploy (backend)

- `aws ecs wait services-stable` OK
- desired=running, pending=0, 1 deployment
- Todas as tasks RUNNING usam a nova task definition
- `GET /api/health` → HTTP 200, JSON válido, version=TARGET_SHA
- `GET /api/admin/finance/accountant-report` → HTTP 401 ou 403

## Backup e Rollback — Backend

**Captura prévia:**
- previous_task_definition_arn (do serviço ativo, não da última ACTIVE)
- previous_image, previous_git_commit

**Rollback automático** (se deploy ou verificação falhar):
- `aws ecs update-service --task-definition $PREVIOUS_TASK_DEFINITION_ARN`
- `aws ecs wait services-stable`
- Re-verifica health

**Condições:**
- Só executa se task definition nova foi registrada E update-service executado
- Usa exatamente o ARN capturado (nunca revision-1 ou latest)

## Backup e Rollback — Frontend

**Backup:**
- Download completo do bucket antes de qualquer escrita
- Armazenado em diretório temporário exclusivo do runner
- Validado: index.html presente e não-vazio

**Rollback automático** (se verificação pós-deploy falhar):
- `aws s3 sync $BACKUP/ s3://bucket/ --delete`
- Restaura index.html com no-cache
- Nova invalidação CloudFront
- Verifica homepage HTTP 200 após restauração

**Condições:**
- Só executa se S3 já recebeu escrita E backup está validado
- Não executa se falha ocorreu antes da escrita

## Condições de parada

| Marcador | Significado |
|----------|-------------|
| `BACKEND_ROLLBACK_COMPLETED` | Deploy falhou, rollback bem-sucedido |
| `BACKEND_ROLLBACK_FAILED` | Intervenção manual necessária |
| `FRONTEND_ROLLBACK_COMPLETED` | Deploy falhou, frontend restaurado |
| `FRONTEND_ROLLBACK_FAILED` | Intervenção manual necessária |

## Como identificar sucesso

- Backend workflow verde
- Frontend workflow verde
- Nenhum rollback executado
- Health OK, endpoint accountant acessível (401)
- Homepage OK, assets carregando

## Como identificar rollback

- Workflow vermelho com marcador `_ROLLBACK_STARTED`
- Se `_ROLLBACK_COMPLETED`: sistema restaurado, investigar a causa
- Se `_ROLLBACK_FAILED`: intervenção manual imediata

## Limitações restantes

- Workflow não autorizado para execução real nesta tarefa
- Não há pipeline automática backend→frontend (intencional)
- Rollback do backend é limitado à task definition anterior imediata
- Observabilidade avançada (métricas, alertas) não implementada
- Merge do PR não autoriza execução do workflow

## Débitos técnicos (não implementados)

- OIDC no lugar de chaves AWS estáticas
- ECR imutável por configuração de repositório
- GitHub Environment com aprovador obrigatório
- Observabilidade avançada (CloudWatch alarms + Slack)
- Rollback entre commits arbitrários (não apenas task definition anterior)
