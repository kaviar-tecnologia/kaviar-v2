# DEMO RUNBOOK - Kaviar para Investidores
**Versão:** 1.0  
**Data:** 03/02/2026  
**Objetivo:** Demo profissional para 10 investidores anjo

---

## 🎯 Visão Geral

Esta demo permite que investidores vejam o produto Kaviar funcionando com dados realistas, sem risco para produção.

**Características:**
- ✅ Dados seed realistas (não inflados)
- ✅ 10 contas read-only para investidores
- ✅ Badge "Demonstração" visível
- ✅ Ações destrutivas bloqueadas
- ✅ Dashboard executivo com KPIs
- ✅ Zero risco para produção

---

## 🚀 Como Ativar Demo Mode

### Opção 1: Query Parameter (Recomendado)
```
https://kaviar.com.br/admin?demo=1
```

### Opção 2: Variável de Ambiente
```bash
# .env.local
VITE_DEMO_MODE=true
```

### Opção 3: Login com Conta Investidor
```
Email: investor01@kaviar.com
Senha: [ver INVESTORS_ACCESS.md]
```
*Ativa demo mode automaticamente*

---

## 👥 10 Contas de Investidor

### Credenciais

| Email | Senha | Role |
|-------|-------|------|
| investor01@kaviar.com | Kav!ar2026#Inv01 | INVESTOR_VIEW |
| investor02@kaviar.com | Kav!ar2026#Inv02 | INVESTOR_VIEW |
| investor03@kaviar.com | Kav!ar2026#Inv03 | INVESTOR_VIEW |
| investor04@kaviar.com | Kav!ar2026#Inv04 | INVESTOR_VIEW |
| investor05@kaviar.com | Kav!ar2026#Inv05 | INVESTOR_VIEW |
| investor06@kaviar.com | Kav!ar2026#Inv06 | INVESTOR_VIEW |
| investor07@kaviar.com | Kav!ar2026#Inv07 | INVESTOR_VIEW |
| investor08@kaviar.com | Kav!ar2026#Inv08 | INVESTOR_VIEW |
| investor09@kaviar.com | Kav!ar2026#Inv09 | INVESTOR_VIEW |
| investor10@kaviar.com | Kav!ar2026#Inv10 | INVESTOR_VIEW |

**⚠️ IMPORTANTE:** Trocar senhas antes de distribuir para investidores reais.

### Permissões (INVESTOR_VIEW)

**Pode:**
- ✅ Ver dashboard e KPIs
- ✅ Ver lista de motoristas (sem dados sensíveis)
- ✅ Ver bairros mapeados
- ✅ Ver corridas demo (agregadas)
- ✅ Ver status do sistema
- ✅ Ver feature flags (read-only)

**Não pode:**
- ❌ Aprovar/rejeitar motoristas
- ❌ Editar dados
- ❌ Excluir registros
- ❌ Ver CPF, telefone, endereço
- ❌ Disparar ações (pagamentos, notificações)
- ❌ Acessar logs sensíveis

---

## 📊 Dados Demo (O Que Verão)

### Dashboard Admin

**KPIs:**
- 162 bairros mapeados (real)
- 28 motoristas ativos (plausível para pré-lançamento)
- 9 motoristas pendentes aprovação
- 247 corridas demo (últimos 30 dias)
- 6 eventos de compliance

**Gráfico:**
- Corridas por dia (últimos 30 dias)
- Crescimento gradual (4-12 corridas/dia)

**Mapa:**
- 162 geofences do Rio de Janeiro
- Pins de motoristas ativos (demo)
- Heat map de corridas (demo)

### Passenger View
- 8 favoritos salvos
- 4 corridas no histórico (completed, cancelled)
- Perfil completo (dados fictícios)

### Driver View
- Ganhos do mês: R$ 1.847,30
- 42 corridas concluídas
- Avaliação: 4.8 ⭐
- Documentos: CNH aprovada, Certidão pendente

### System Status
- Health: ✅ Healthy
- Database: ✅ Connected
- Versão: 1.0.0
- Commit: cdcc7f2
- Feature Flags: 3 ativas (read-only)

---

## 🔧 Como Rodar Local

### 1. Clonar Repositório
```bash
git clone https://github.com/kaviar-tecnologia/kaviar-v2.git
cd kaviar-v2/frontend-app
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Ambiente Demo
```bash
# Criar .env.local
cat > .env.local << EOF
VITE_API_URL=https://api.kaviar.com.br
VITE_DEMO_MODE=true
EOF
```

### 4. Rodar Frontend
```bash
npm run dev
```

### 5. Acessar
```
http://localhost:5173/admin?demo=1
```

---

## 🌐 Como Publicar demo.kaviar.com.br

### Opção 1: Vercel (Recomendado)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
cd frontend-app
vercel --prod

# Configurar domínio
vercel domains add demo.kaviar.com.br
```

**Variáveis de ambiente (Vercel):**
```
VITE_API_URL=https://api.kaviar.com.br
VITE_DEMO_MODE=true
```

### Opção 2: AWS S3 + CloudFront

```bash
# Build
npm run build

# Upload para S3
aws s3 sync dist/ s3://demo-kaviar-frontend --delete

# Invalidar CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

### Opção 3: Netlify

```bash
# Instalar Netlify CLI
npm i -g netlify-cli

# Deploy
cd frontend-app
netlify deploy --prod
```

---

## 🎬 Tour Guiado (2 Minutos)

### Passo 1: Login
```
1. Acesse: https://demo.kaviar.com.br
2. Login: investor01@kaviar.com
3. Senha: [ver acima]
```

### Passo 2: Dashboard (30s)
```
- Ver KPIs no topo
- Ver gráfico de corridas
- Ver mapa com geofences
```

### Passo 3: Motoristas (30s)
```
- Menu: Motoristas
- Ver lista de 28 motoristas
- Ver 9 pendentes aprovação
- Notar: botões de ação desabilitados
```

### Passo 4: Bairros (20s)
```
- Menu: Bairros
- Ver 162 bairros mapeados
- Ver geofences no mapa
```

### Passo 5: System Status (20s)
```
- Menu: Status do Sistema
- Ver health checks
- Ver versão/commit
- Ver feature flags
```

### Passo 6: Segurança (20s)
```
- Tentar aprovar motorista → Bloqueado
- Tentar editar dados → Bloqueado
- Ver badge "Demonstração" sempre visível
```

---

## 🔒 Segurança

### O Que Está Protegido

**Backend:**
- Middleware `investorView` bloqueia POST/PUT/DELETE
- Endpoints sensíveis retornam 403 para INVESTOR_VIEW
- Dados pessoais (CPF, telefone) são omitidos

**Frontend:**
- Botões de ação desabilitados (com tooltip explicativo)
- Formulários bloqueados
- Badge "Demonstração" sempre visível

**Banco de Dados:**
- Zero alterações no banco de produção
- Dados demo vêm de JSON local ou endpoints /api/demo/*

### O Que NÃO Está na Demo

- ❌ Dados reais de usuários
- ❌ Corridas reais
- ❌ Pagamentos reais
- ❌ Notificações reais
- ❌ Logs sensíveis

---

## 🐛 Troubleshooting

### Problema: Demo mode não ativa
**Solução:**
```bash
# Verificar variável de ambiente
echo $VITE_DEMO_MODE

# Ou usar query parameter
?demo=1
```

### Problema: Botões não estão bloqueados
**Solução:**
```javascript
// Verificar se demo mode está ativo
console.log(import.meta.env.VITE_DEMO_MODE)
```

### Problema: Dados não aparecem
**Solução:**
```bash
# Verificar se demoData.ts existe
ls frontend-app/src/demo/demoData.ts

# Verificar console do navegador
# Deve mostrar: "Demo mode ativo"
```

### Problema: Login investidor não funciona
**Solução:**
```bash
# Verificar se contas foram criadas no backend
# Rodar script de seed (se necessário)
node backend/scripts/seed-investors.js
```

---

## 📝 Checklist Pré-Apresentação

**Antes de mostrar para investidores:**

- [ ] Testar login com investor01
- [ ] Verificar badge "Demonstração" visível
- [ ] Confirmar KPIs aparecem corretamente
- [ ] Testar que botões de ação estão bloqueados
- [ ] Verificar gráfico de corridas renderiza
- [ ] Testar mapa com geofences
- [ ] Abrir System Status e confirmar health OK
- [ ] Testar em Chrome, Firefox, Safari
- [ ] Testar em mobile (responsivo)
- [ ] Preparar script de apresentação (2 min)

---

## 📞 Suporte

**Problemas técnicos:**
- Email: [seu-email]
- WhatsApp: [seu-telefone]

**Acesso investidores:**
- Enviar credenciais por email seguro
- Trocar senhas antes de distribuir
- Definir data de expiração (ex: 30 dias)

---

## 🎯 Próximos Passos

**Após apresentação:**
1. Coletar feedback dos investidores
2. Ajustar demo baseado em perguntas
3. Desativar contas após período (30 dias)
4. Implementar melhorias sugeridas

**Para produção:**
1. Remover demo mode
2. Implementar features reais
3. Lançar piloto na Rocinha
4. Validar unit economics

---

**Versão:** 1.0  
**Última atualização:** 03/02/2026  
**Próxima revisão:** Após feedback investidores
