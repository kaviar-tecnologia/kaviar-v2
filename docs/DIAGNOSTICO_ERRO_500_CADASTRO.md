# 🚨 DIAGNÓSTICO - ERRO 500 NO CADASTRO MOTORISTA

**Data:** 01/03/2026 23:45 BRT  
**Status:** Código pronto, aguardando deploy

---

## 🔍 DIAGNÓSTICO BASEADO EM EVIDÊNCIAS

### **1. Endpoint `/api/neighborhoods/smart-list` - ✅ FUNCIONA**

```bash
curl -X GET "https://api.kaviar.com.br/api/neighborhoods/smart-list"
# Resultado: 200 OK + lista de bairros
```

**Conclusão:** Não é problema de bairros.

---

### **2. Endpoint `/api/auth/driver/register` - ❌ NÃO EXISTE EM PRODUÇÃO**

```bash
curl -X POST "https://api.kaviar.com.br/api/auth/driver/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","phone":"+5521999999999","password":"senha123"}'

# Resultado: {"success":false,"error":"Endpoint não encontrado"}
```

**Conclusão:** Endpoint existe no código (commit `506ba87`) mas não foi deployado.

---

### **3. CloudWatch Logs - ✅ SEM ERROS 500 RECENTES**

```bash
aws logs tail /ecs/kaviar-backend --since 30m --filter-pattern "500"
# Resultado: Nenhum erro 500 nos últimos 30 minutos
```

**Conclusão:** Backend não está recebendo requisições (endpoint não existe).

---

## 🎯 CAUSA RAIZ

**Problema:** Endpoint `/api/auth/driver/register` não foi deployado em produção.

**Evidência:**
- Código existe no repositório (commit `506ba87`)
- curl retorna "Endpoint não encontrado"
- Sem erros 500 nos logs (endpoint não está registrado)

---

## 🚀 SOLUÇÃO - DEPLOY BACKEND

### **Opção 1: CI/CD Automático (Recomendado)**

```bash
# Verificar se GitHub Actions está rodando
# https://github.com/kaviar-tecnologia/kaviar-v2/actions

# Se não houver workflow automático, usar Opção 2
```

---

### **Opção 2: Deploy Manual ECS**

```bash
# 1. Build backend
cd /home/goes/kaviar/backend
npm run build

# 2. Verificar se endpoint foi compilado
grep -r "driver/register" dist/routes/driver-auth.js
# Esperado: router.post('/driver/register'

# 3. Forçar novo deployment
aws ecs update-service \
  --cluster kaviar-cluster \
  --service kaviar-backend-service \
  --force-new-deployment \
  --region us-east-1

# 4. Aguardar task ficar running (2-3 minutos)
watch -n 5 'aws ecs describe-services \
  --cluster kaviar-cluster \
  --services kaviar-backend-service \
  --region us-east-1 \
  --query "services[0].{running:runningCount,desired:desiredCount}"'

# 5. Verificar logs
aws logs tail /ecs/kaviar-backend --follow --region us-east-1
```

---

### **Opção 3: Deploy via Docker (se necessário)**

```bash
cd /home/goes/kaviar/backend

# Build imagem
docker build -t kaviar-backend:latest .

# Tag para ECR
docker tag kaviar-backend:latest <ECR_URI>:latest

# Push para ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR_URI>
docker push <ECR_URI>:latest

# Forçar novo deployment
aws ecs update-service \
  --cluster kaviar-cluster \
  --service kaviar-backend-service \
  --force-new-deployment \
  --region us-east-1
```

---

## ✅ VALIDAÇÃO PÓS-DEPLOY

### **1. Testar endpoint público**

```bash
# Teste 1: Cadastro simples (sem bairro)
curl -X POST "https://api.kaviar.com.br/api/auth/driver/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Motorista Teste Deploy",
    "email": "motorista.deploy@kaviar.com",
    "phone": "+5521999999999",
    "password": "senha123"
  }'

# Esperado: 201 + token
# {"success":true,"token":"eyJ...","user":{...}}
```

```bash
# Teste 2: Cadastro com bairro
curl -X POST "https://api.kaviar.com.br/api/auth/driver/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Motorista Com Bairro",
    "email": "motorista.combairro.deploy@kaviar.com",
    "phone": "+5521988888888",
    "password": "senha123",
    "neighborhoodId": "b9440ecc-4bb8-4aeb-ad59-0670b7f86ece"
  }'

# Esperado: 201 + token
```

```bash
# Teste 3: Email duplicado
curl -X POST "https://api.kaviar.com.br/api/auth/driver/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Motorista Teste Deploy",
    "email": "motorista.deploy@kaviar.com",
    "phone": "+5521999999999",
    "password": "senha123"
  }'

# Esperado: 409
# {"success":false,"error":"Email já cadastrado"}
```

---

### **2. Testar no app (Expo Go)**

```bash
# 1. Abrir app kaviar no Expo Go
# 2. Ir para cadastro
# 3. Preencher dados:
#    - Nome: Motorista App Teste
#    - Email: motorista.app@kaviar.com
#    - Telefone: +5521977777777
#    - Senha: senha123
# 4. Pular seleção de bairro (ou selecionar um)
# 5. Clicar "Cadastrar"
# 6. Verificar: sucesso + redirecionamento (SEM tela vermelha)
```

---

## 📊 CHECKLIST DE VALIDAÇÃO

### **Backend**
- [ ] Build concluído sem erros
- [ ] Endpoint compilado em `dist/routes/driver-auth.js`
- [ ] Deploy ECS concluído
- [ ] Task rodando (runningCount = 1)
- [ ] curl retorna 201 (não "Endpoint não encontrado")

### **App**
- [ ] Cadastro sem bairro funciona
- [ ] Cadastro com bairro funciona
- [ ] Sem tela vermelha (erro 500)
- [ ] Auto-login funciona
- [ ] Redirecionamento para /(driver)/online funciona

### **Logs**
- [ ] Sem erros 500 no CloudWatch
- [ ] Log "Error in driver register" não aparece
- [ ] Motorista criado no banco

---

## 🐛 TROUBLESHOOTING

### **Problema: curl ainda retorna "Endpoint não encontrado"**

**Causa:** Deploy não foi aplicado ou task antiga ainda rodando.

**Solução:**
```bash
# Forçar parada da task antiga
aws ecs list-tasks --cluster kaviar-cluster --service-name kaviar-backend-service --region us-east-1
aws ecs stop-task --cluster kaviar-cluster --task <TASK_ARN> --region us-east-1

# Aguardar nova task subir
aws ecs describe-services \
  --cluster kaviar-cluster \
  --services kaviar-backend-service \
  --region us-east-1 \
  --query 'services[0].runningCount'
```

---

### **Problema: App ainda mostra tela vermelha**

**Causa:** Cache do Expo ou backend ainda não deployado.

**Solução:**
```bash
# 1. Limpar cache do Expo
cd /home/goes/kaviar/kaviar-app
npx expo start -c

# 2. Verificar URL do backend no app
# Arquivo: kaviar-app/.env
# EXPO_PUBLIC_API_URL=https://api.kaviar.com.br

# 3. Testar endpoint manualmente
curl -X POST "https://api.kaviar.com.br/api/auth/driver/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test2@test.com","phone":"+5521999999999","password":"senha123"}'
```

---

### **Problema: Erro 500 após deploy**

**Causa:** Erro no código do endpoint.

**Solução:**
```bash
# Verificar logs
aws logs tail /ecs/kaviar-backend --since 5m --filter-pattern "Error in driver register" --region us-east-1

# Verificar se Prisma está funcionando
aws logs tail /ecs/kaviar-backend --since 5m --filter-pattern "Prisma" --region us-east-1
```

---

## 📝 RESUMO

**Diagnóstico:** Endpoint `/api/auth/driver/register` não foi deployado

**Evidências:**
- ✅ Código existe (commit `506ba87`)
- ✅ Endpoint `/api/neighborhoods/smart-list` funciona
- ❌ curl retorna "Endpoint não encontrado"
- ✅ Sem erros 500 nos logs (endpoint não registrado)

**Solução:** Deploy backend

**Próximos passos:**
1. Deploy backend (Opção 1, 2 ou 3)
2. Validar com curl
3. Testar no app

---

**FIM DO DIAGNÓSTICO**
