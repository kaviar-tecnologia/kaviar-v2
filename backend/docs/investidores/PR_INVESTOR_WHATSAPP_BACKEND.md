# PR: Investor WhatsApp Invites (Backend Only)

## 📋 Resumo

Adiciona suporte para envio de convites de investidores via WhatsApp usando templates HX aprovados do Twilio.

**Branch**: `feat/investor-whatsapp-backend`  
**Base**: `origin/main` (04e780d)  
**Commits**: 5 commits backend-only

## 🎯 Funcionalidade

Endpoint `/api/admin/investors/invite` agora aceita:

### Email (existente - sem mudanças)
```json
{
  "channel": "email",
  "email": "investor@example.com",
  "role": "INVESTOR_VIEW"
}
```

### WhatsApp (novo)
```json
{
  "channel": "whatsapp",
  "phone": "+5521980669989",
  "role": "ANGEL_VIEWER"
}
```

## 📦 Commits Incluídos

```
4d8d182 fix(whatsapp): normalize To as whatsapp:+E164 (prevents Twilio 21211)
b3003e8 fix(investors): structured logs for WhatsApp invite failures (anti-frankenstein)
0269856 fix(whatsapp): use approved HX for investor invite template
bf2601d feat(investors): send WhatsApp invite with secure link (anti-frankenstein)
2b77cbb feat(whatsapp): HX templates registry + sender service (anti-frankenstein)
```

## 🔧 Mudanças Técnicas

### 1. Módulo WhatsApp (`backend/src/modules/whatsapp/`)
- ✅ `whatsapp-templates.ts` - Registry de 16 templates HX aprovados
- ✅ `whatsapp-client.ts` - Client Twilio + normalização E.164
- ✅ `whatsapp.service.ts` - Service de envio via Content API
- ✅ `whatsapp-events.ts` - Facade com métodos tipados
- ✅ `index.ts` - Exports centralizados

### 2. Rota de Convites (`backend/src/routes/investor-invites-v2.ts`)
- ✅ Suporta `channel=email` e `channel=whatsapp`
- ✅ WhatsApp primeiro, email fallback automático
- ✅ Logs estruturados (JSON) com detalhes Twilio
- ✅ Normalização E.164 automática

### 3. Logs Estruturados
- `INVESTOR_INVITE_WHATSAPP_ATTEMPT` - Antes de enviar
- `INVESTOR_INVITE_WHATSAPP_SENT` - Sucesso
- `INVESTOR_INVITE_WHATSAPP_FAILED` - Falha com `twilioCode`, `twilioStatus`, `twilioMessage`, `moreInfo`
- `INVESTOR_INVITE_EMAIL_SENT` - Fallback email

### 4. Normalização E.164
- Remove espaços, traços, parênteses
- Valida formato `+` + dígitos
- Adiciona prefixo `whatsapp:`
- Previne erro Twilio 21211

## ✅ Testes

### Build
```bash
cd /home/goes/kaviar/backend
npm ci
npm run build
# ✅ Build OK
```

### Teste Unitário (Normalização)
```bash
cd /home/goes/kaviar/backend
node test-whatsapp-normalize.js
# ✅ 11 testes passaram, 0 falharam
```

## 🔐 Configuração Necessária (ECS)

### Variáveis de Ambiente
```bash
# Obrigatórias (SSM SecureString)
TWILIO_ACCOUNT_SID=<via SSM>
TWILIO_AUTH_TOKEN=<via SSM>

# Configuração
TWILIO_WHATSAPP_ENABLED=true
TWILIO_WHATSAPP_FROM=whatsapp:+5521968648777
TWILIO_VERIFY_VOICE_ENABLED=true
TWILIO_VERIFY_VOICE_NUMBER=+552123915686
TWILIO_VERIFY_VOICE_WEBHOOK_PATH=/api/twilio/verify-voice
```

**Nota**: Configuração de infra (SSM/IAM) já foi feita em commits separados (não incluídos neste PR).

## 🚀 Deploy (Após Merge)

### 1. Merge PR no main
```bash
# Via GitHub UI ou CLI
gh pr merge <PR_NUMBER> --squash
```

### 2. Deploy ECS
```bash
# Usar pipeline padrão do KAVIAR
# Ou manualmente:
cd /home/goes/kaviar/backend
npm run build

# Build Docker image
docker build -t kaviar-backend:latest .

# Push para ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <ECR_URI>
docker tag kaviar-backend:latest <ECR_URI>/kaviar-backend:latest
docker push <ECR_URI>/kaviar-backend:latest

# Update ECS service
aws ecs update-service \
  --region us-east-2 \
  --cluster kaviar-cluster \
  --service kaviar-backend-service \
  --force-new-deployment
```

### 3. Validação Pós-Deploy

#### Health Check
```bash
API="https://api.kaviar.com.br"
curl -sS "$API/api/health" | jq -r '.version'
# Deve mostrar novo commit hash
```

#### Teste Email (fluxo existente)
```bash
curl -sS -X POST "$API/api/admin/investors/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"email","email":"test@example.com","role":"INVESTOR_VIEW"}' | jq
# Esperado: {"success": true, "message": "Convite enviado via email."}
```

#### Teste WhatsApp (novo)
```bash
curl -sS -X POST "$API/api/admin/investors/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"whatsapp","phone":"+5521980669989","role":"ANGEL_VIEWER"}' | jq
# Esperado: {"success": true, "message": "Convite enviado via WhatsApp."}
```

#### Verificar Logs CloudWatch
```bash
REGION="us-east-2"
LOG_GROUP="/aws/ecs/kaviar-backend"

# Iniciar query
START_RES=$(aws logs start-query --region "$REGION" \
  --log-group-name "$LOG_GROUP" \
  --start-time $(( $(date +%s) - 900 )) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message
| filter @message like /INVESTOR_INVITE_WHATSAPP_/
| sort @timestamp desc
| limit 60')

QID=$(echo "$START_RES" | jq -r '.queryId')

# Aguardar e obter resultados
sleep 5
aws logs get-query-results --region "$REGION" --query-id "$QID" | jq
```

**Logs esperados**:
- `INVESTOR_INVITE_WHATSAPP_ATTEMPT`
- `INVESTOR_INVITE_WHATSAPP_SENT`

## 🎯 Sem Breaking Changes

- ✅ Email continua funcionando (default)
- ✅ Endpoint permanece o mesmo
- ✅ Fluxo atual não foi alterado
- ✅ WhatsApp é adição opcional

## 📝 Próximos Passos

Após backend em produção e validado:
1. PR separado do frontend (commit e495218) para adicionar seletor de canal na UI
2. Deploy frontend S3/CloudFront

## 🔗 Links

- **PR**: https://github.com/kaviar-tecnologia/kaviar-v2/pull/new/feat/investor-whatsapp-backend
- **Branch**: `feat/investor-whatsapp-backend`
- **Base**: `main` (04e780d)
