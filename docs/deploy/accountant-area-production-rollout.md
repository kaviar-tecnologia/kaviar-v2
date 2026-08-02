# Accountant Area — Production Rollout Plan

## Commit-alvo

O deploy coordenado deve usar o SHA completo da `main` no momento da execução.

## Ordem obrigatória: Backend → Frontend

1. Backend workflow executado e concluído com sucesso
2. ECS estável (desired=running, pending=0, 1 deployment)
3. Health check HTTP 200 com versão correta (obrigatória)
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
- circuitBreaker.enable ≠ true
- circuitBreaker.rollback ≠ true

Este bloqueio está implementado no YAML como step `ECS preflight safety check`
dentro do job `resolve-production-state`, executado antes de build/push/register/update-service.

## Verificação pós-deploy (backend)

- `aws ecs wait services-stable` OK
- desired=running, pending=0, 1 deployment
- TASK_COUNT = DESIRED
- Todas as tasks RUNNING usam a nova task definition
- `GET /api/health` → HTTP 200, JSON válido
- version **obrigatória** (ausência = `BACKEND_VERSION_MISSING`)
- version = TARGET_SHA (mismatch = `BACKEND_VERSION_MISMATCH`)
- `GET /api/admin/finance/accountant-report` → HTTP 401 ou 403
- **Logs**: CloudWatch consultado desde `deploy_started_at_ms`, padrões críticos detectados
  - FATAL, UnhandledPromiseRejection, PrismaClientInitializationError, ECONNREFUSED, etc.
  - Marker: `CRITICAL_BACKEND_ERROR_AFTER_DEPLOY`
  - Nenhuma mensagem completa ou dado sensível impresso

## Backup e Rollback — Backend

**Captura prévia:**
- previous_task_definition_arn (do serviço ativo, não da última ACTIVE)
- previous_image, previous_git_commit

**Condição de execução:**
- `failure() && steps.ecs_deploy.outputs.update_attempted == 'true'`
- Se task registrada mas update-service não executou → sem rollback

**Lógica de rollback:**
- Se serviço já está na task definition anterior → `BACKEND_ROLLBACK_NOT_REQUIRED`
- Se serviço está na task definition nova → executa update-service para anterior
- Se serviço está em task definition inesperada → `BACKEND_ROLLBACK_STATE_CONFLICT` (manual)

**Validação pós-rollback:**
- Health HTTP 200 obrigatório
- JSON válido obrigatório
- version = previous_git_commit (obrigatório)
- Só marca `BACKEND_ROLLBACK_COMPLETED` após todas as validações

## Backup e Rollback — Frontend

**Backup:**
- Download completo do bucket antes de qualquer escrita
- Armazenado em diretório temporário exclusivo do runner
- Validado: index.html presente, file count > 0
- `backup_valid=true` exportado como output

**Condição de execução do rollback:**
- `failure() && steps.s3_deploy.outputs.write_attempted == 'true' && steps.backup.outputs.backup_valid == 'true'`
- `write_attempted` gravado ANTES do primeiro `aws s3 sync` de escrita
- Se falha antes da escrita S3 → sem rollback
- Se backup inválido → sem rollback (falha manual)

**Rollback:**
- Restore completo do backup via s3 sync --delete
- index.html restaurado por último com no-cache
- Manifesto (.index-meta.json) excluído da restauração
- CloudFront invalidation criada e aguardada (`wait invalidation-completed`)
- Verifica homepage HTTP 200 após restauração

**Build validation:**
- index.html obrigatório
- Pelo menos um JS asset obrigatório
- Rota `financeiro/contador` encontrada no bundle (falha, não warning)
- Marker: `ACCOUNTANT_FRONTEND_BUNDLE_NOT_FOUND`
- **Build manifest**: SHA-256 do index + lista de todos assets referenciados
- Todos os assets locais verificados antes do deploy

**S3 verification (após escrita, antes de invalidação):**
- index.html baixado do S3 e SHA-256 comparado com build
- ContentLength validado como inteiro positivo
- Todos os assets do manifesto verificados via head-object
- Markers: `FRONTEND_S3_INDEX_MISMATCH`, `FRONTEND_S3_ASSET_MISSING`, `FRONTEND_INDEX_METADATA_INVALID`

**CloudFront verification (após invalidação completada):**
- Homepage HTTP 200, HTML válido
- Todos os assets do build manifest acessíveis via CDN (HTTP 200)
- Markers: `FRONTEND_HTTP_SMOKE_TEST_FAILED`, `FRONTEND_ASSET_VALIDATION_FAILED`, `FRONTEND_EXPECTED_ASSET_NOT_PUBLISHED`

## Condições de parada

| Marcador | Significado |
|----------|-------------|
| `BACKEND_ROLLBACK_COMPLETED` | Deploy falhou, rollback bem-sucedido |
| `BACKEND_ROLLBACK_NOT_REQUIRED` | Serviço já na versão anterior |
| `BACKEND_ROLLBACK_STATE_CONFLICT` | Estado inesperado, intervenção manual |
| `BACKEND_ROLLBACK_FAILED` | Intervenção manual necessária |
| `FRONTEND_ROLLBACK_COMPLETED` | Frontend restaurado do backup |
| `FRONTEND_ROLLBACK_FAILED` | Intervenção manual necessária |

## Limitações restantes

- Workflow não autorizado para execução real nesta tarefa
- Não há pipeline automática backend→frontend (intencional)
- Rollback do backend limitado à task definition anterior imediata
- Merge do PR não autoriza execução do workflow

## Débitos técnicos (não implementados)

- OIDC no lugar de chaves AWS estáticas
- ECR imutável por configuração de repositório
- GitHub Environment com aprovador obrigatório
- Observabilidade avançada (CloudWatch alarms + Slack)
- Rollback entre commits arbitrários