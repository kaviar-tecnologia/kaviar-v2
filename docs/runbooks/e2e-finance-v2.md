# Financeiro V2 — E2E Tests Operacional

## Pré-requisitos

- Node 20
- PostgreSQL 15+ rodando em `localhost:5432`
- Banco `kaviar_test` criado
- Portas 3003 (backend) e 5174 (frontend) livres

## Banco de teste

```bash
# Criar banco (se não existir)
PGPASSWORD=postgres createdb -U postgres -h 127.0.0.1 kaviar_test

# Setup completo (schema + tabelas legacy + seed)
./scripts/setup-e2e-db.sh
```

**DATABASE_URL**: `postgresql://postgres:postgres@127.0.0.1:5432/kaviar_test`

## Suítes disponíveis

### 1. Mock-based (rápida, sem DB)

```bash
cd frontend-app
TZ=America/Sao_Paulo npx playwright test
```

- **100+ testes** em ~90s
- Não requer backend nem PostgreSQL
- Usa route interception (mocks)
- Ideal para CI rápido e dev local

### 2. Integrada (real: frontend → backend → PostgreSQL)

```bash
# Terminal 1: Backend
cd backend
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/kaviar_test" \
  JWT_SECRET=e2e-test-secret PORT=3003 NODE_ENV=test TZ=America/Sao_Paulo \
  npx tsx src/server.ts

# Terminal 2: Frontend
cd frontend-app
npx vite --port 5174

# Terminal 3: Testes
cd frontend-app
TZ=America/Sao_Paulo npx playwright test --config=playwright.integrated.config.ts
```

Ou via config automático (Playwright inicia serviços):
```bash
cd frontend-app
E2E_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/kaviar_test" \
  TZ=America/Sao_Paulo npx playwright test --config=playwright.integrated.config.ts
```

## Credenciais E2E (somente banco de teste)

| Perfil | Email | Senha | Acesso |
|--------|-------|-------|--------|
| SUPER_ADMIN | e2e-superadmin@kaviar.test | E2E_super_2026! | Total |
| FINANCE | e2e-finance@kaviar.test | E2E_finance_2026! | Leitura + CSV |
| OPERATOR | e2e-operator@kaviar.test | E2E_operator_2026! | Sem financeiro |

Criados via: `cd backend && NODE_ENV=test npx tsx prisma/seed-e2e-admins.ts`

## Portas

| Serviço | Porta | Notas |
|---------|-------|-------|
| Backend (teste) | 3003 | Proxy do Vite aponta aqui |
| Frontend (teste integrado) | 5174 | Separado do dev (5173) |
| PostgreSQL | 5432 | Banco kaviar_test |

## Proteção contra produção

- `assert-safe-db-url.ts`: bloqueia hosts que não sejam localhost
- `global-setup.ts`: valida hostname + nome do banco
- `seed-e2e-admins.ts`: recusa executar sem NODE_ENV=test ou E2E_SEED=1
- Workflow CI: usa service container local, jamais RDS

## Diagnóstico de falhas

```bash
# Ver traces de falha
npx playwright show-trace frontend-app/test-results/<test-name>/trace.zip

# Re-executar um teste específico
TZ=America/Sao_Paulo npx playwright test --config=playwright.integrated.config.ts -g "nome do teste"

# Testar estabilidade (10 repetições)
TZ=America/Sao_Paulo npx playwright test --config=playwright.integrated.config.ts --repeat-each=10
```

## CI

Workflow: `.github/workflows/finance-e2e-integrated.yml`

Dispara em:
- PRs que alteram frontend, backend, prisma ou scripts
- Manualmente via `workflow_dispatch`

PostgreSQL: service container `postgres:15` com banco `kaviar_e2e`.

## Recriar banco do zero

```bash
PGPASSWORD=postgres dropdb -U postgres -h 127.0.0.1 kaviar_test
PGPASSWORD=postgres createdb -U postgres -h 127.0.0.1 kaviar_test
./scripts/setup-e2e-db.sh
```
