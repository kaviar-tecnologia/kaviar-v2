# DEMO RUNBOOK - Kaviar para Investidores (v2.0)
**Versão:** 2.0 (Passenger + Admin)  
**Data:** 03/02/2026  
**Objetivo:** Demo profissional para 10 investidores anjo

---

## 🎯 Visão Geral

Esta demo permite que investidores vejam **ambos os frontends** (Passenger + Admin) com as **mesmas 10 contas**, sem risco para produção.

**Características:**
- ✅ Passenger + Admin com mesmas credenciais
- ✅ Dados seed realistas (não inflados)
- ✅ 10 contas read-only (INVESTOR_VIEW)
- ✅ Badge "Demonstração" visível
- ✅ Ações destrutivas bloqueadas
- ✅ Roteiro guiado (3 passos)
- ✅ Zero risco para produção

---

## 🚀 Rotas de Acesso

### Passenger
```
https://kaviar.com.br/login?demo=1
```

### Admin
```
https://kaviar.com.br/admin/login?demo=1
```

**✨ Mesmas 10 contas funcionam em ambos os frontends!**

---

## 👥 10 Contas de Investidor

### Credenciais

| Email | Senha | Acesso |
|-------|-------|--------|
| investor01@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor02@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor03@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor04@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor05@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor06@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor07@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor08@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor09@kaviar.com | [ver arquivo] | Passenger + Admin |
| investor10@kaviar.com | [ver arquivo] | Passenger + Admin |

**📄 Senhas:** Ver `INVESTORS_ACCESS_GENERATED.md` (gerado pelo script)

**⚠️ IMPORTANTE:** 
- Senhas aleatórias (16 caracteres)
- Trocar no primeiro acesso (obrigatório)
- Válido por 30 dias

### Permissões (INVESTOR_VIEW)

**Pode:**
- ✅ Ver dashboard e KPIs (Admin)
- ✅ Ver favoritos e histórico (Passenger)
- ✅ Ver lista de motoristas (sem dados sensíveis)
- ✅ Ver bairros mapeados
- ✅ Ver corridas demo (agregadas)
- ✅ Ver status do sistema
- ✅ Ver feature flags (read-only)

**Não pode:**
- ❌ Solicitar corridas (Passenger)
- ❌ Aprovar/rejeitar motoristas (Admin)
- ❌ Editar dados
- ❌ Excluir registros
- ❌ Ver CPF, telefone, endereço completo
- ❌ Baixar documentos (CNH, certidões)
- ❌ Disparar ações (pagamentos, notificações)
- ❌ Exportar dados

---

## 📊 Dados Demo (O Que Verão)

### Passenger View

**Perfil:**
- Nome: Demo Passageiro
- Email: demo.passageiro@kaviar.com
- Telefone: (21) 9****-**** (oculto)
- CPF: ***.***.***.** (oculto)

**Favoritos (8):**
- Casa, Trabalho, Mercado, Academia
- Escola, Posto de Saúde, Igreja, Padaria
- Todos na Rocinha/região

**Histórico (4 corridas):**
1. Rocinha → Copacabana (R$ 18,50) ✅ Concluída
2. Rocinha → Ipanema (R$ 22,00) ✅ Concluída
3. Rocinha → Leblon (R$ 25,50) ✅ Concluída
4. Rocinha → Barra (R$ 0,00) ❌ Cancelada

**Estatísticas:**
- 3 corridas realizadas
- Avaliação média: 4.7 ⭐

### Admin View

**KPIs:**
- 162 bairros mapeados (real)
- 28 motoristas ativos (plausível)
- 9 motoristas pendentes aprovação
- 247 corridas demo (últimos 30 dias)
- 6 eventos de compliance

**Gráfico:**
- Corridas por dia (últimos 30 dias)
- Crescimento gradual (4-12 corridas/dia)
- Total: 247 | Média: 8.2/dia | Máximo: 12

**Mapa:**
- 162 geofences do Rio de Janeiro
- Pins de motoristas ativos (demo)

**System Status:**
- Health: ✅ Healthy
- Database: ✅ Connected
- Versão: 1.0.0
- Commit: 8652666
- Uptime: 72h 15m
- Feature Flags: 3 ativas (read-only)

---

## 🎬 Roteiro Guiado (Primeira Vez)

Ao fazer login com `?demo=1`, aparece automaticamente:

### Passenger (3 passos)
1. **Favoritos** - Veja 8 locais salvos
2. **Histórico** - 4 corridas realizadas
3. **Perfil** - Dados completos

### Admin (3 passos)
1. **Dashboard** - KPIs e gráficos
2. **Bairros** - 162 mapeados
3. **System Status** - Health e versão

**Pode fechar e explorar livremente depois!**

---

## 🔧 Como Rodar Local

### 1. Clonar Repositório
```bash
git clone https://github.com/kaviar-tecnologia/kaviar-v2.git
cd kaviar-v2
```

### 2. Backend - Criar Contas
```bash
cd backend
npm install
node scripts/create-investor-accounts.js
```

**Output:** `INVESTORS_ACCESS_GENERATED.md` com 10 credenciais

### 3. Frontend - Configurar
```bash
cd frontend-app
npm install

# Criar .env.local
cat > .env.local << EOF
VITE_API_URL=https://api.kaviar.com.br
VITE_DEMO_MODE=true
EOF
```

### 4. Rodar
```bash
# Frontend
npm run dev

# Backend (em outro terminal)
cd backend
npm run dev
```

### 5. Acessar
```
Passenger: http://localhost:5173/login?demo=1
Admin: http://localhost:5173/admin/login?demo=1
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

---

## 📧 Como Distribuir para Investidores

### Template de Email

```
Assunto: Acesso Demo - Plataforma Kaviar (Passenger + Admin)

Olá [Nome do Investidor],

Conforme combinado, segue seu acesso exclusivo à demonstração da plataforma Kaviar:

🔗 Passenger: https://demo.kaviar.com.br/login?demo=1
🔗 Admin: https://demo.kaviar.com.br/admin/login?demo=1

📧 Email: [email do investidor]
🔑 Senha: [senha do investidor]

⏱️ Roteiro guiado: 3 passos em cada visão
📱 Funciona em desktop e mobile

O que você verá:

PASSENGER:
✅ 8 favoritos salvos
✅ 4 corridas no histórico
✅ Perfil completo

ADMIN:
✅ Dashboard executivo com KPIs
✅ 162 bairros mapeados (Rio de Janeiro)
✅ Gráfico de corridas (30 dias)
✅ Sistema de geofencing em ação
✅ Painel de motoristas e compliance
✅ Status técnico do sistema

⚠️ Importante:
- Ambiente de demonstração (dados fictícios)
- Acesso somente leitura
- Trocar senha no primeiro acesso
- Válido por 30 dias

Dúvidas? Responda este email ou WhatsApp: [seu-telefone]

Att,
[Seu Nome]
Fundador - Kaviar
```

---

## 🔒 Segurança

### O Que Está Protegido

**Backend:**
- Middleware `investorView` bloqueia POST/PUT/PATCH/DELETE
- Endpoints sensíveis retornam 403 para INVESTOR_VIEW
- Dados pessoais (CPF, telefone) são omitidos ou mascarados
- Download de documentos bloqueado
- Exports bloqueados

**Frontend:**
- Botões de ação desabilitados (com tooltip explicativo)
- Formulários bloqueados
- Badge "Demonstração" sempre visível
- Roteiro guiado no primeiro acesso

**Banco de Dados:**
- Zero alterações no banco de produção
- Dados demo vêm de JSON local (`src/demo/demoData.ts`)
- Nenhuma migration necessária

### O Que NÃO Está na Demo

- ❌ Dados reais de usuários
- ❌ Corridas reais
- ❌ Pagamentos reais
- ❌ Notificações reais
- ❌ Documentos reais (CNH, certidões)
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

### Problema: Roteiro não aparece
**Solução:**
```javascript
// Limpar sessionStorage
sessionStorage.clear()

// Recarregar página
window.location.reload()
```

### Problema: Botões não estão bloqueados
**Solução:**
```javascript
// Verificar se demo mode está ativo
console.log(import.meta.env.VITE_DEMO_MODE)

// Verificar role do usuário
console.log(JSON.parse(localStorage.getItem('user')))
```

### Problema: Login investidor não funciona
**Solução:**
```bash
# Verificar se contas foram criadas no backend
node backend/scripts/create-investor-accounts.js

# Verificar no banco
SELECT * FROM admins WHERE role = 'INVESTOR_VIEW';
```

### Problema: Dados não aparecem
**Solução:**
```bash
# Verificar se demoData.ts existe
ls frontend-app/src/demo/demoData.ts

# Verificar console do navegador
# Deve mostrar: "Demo mode ativo"
```

---

## 📝 Checklist Pré-Apresentação

**Antes de mostrar para investidores:**

**Backend:**
- [ ] Criar 10 contas de investidor
- [ ] Verificar middleware aplicado
- [ ] Testar POST/PUT/DELETE retorna 403

**Frontend Passenger:**
- [ ] Login com investor01 + ?demo=1
- [ ] Ver roteiro guiado (3 passos)
- [ ] Ver 8 favoritos
- [ ] Ver 4 corridas no histórico
- [ ] Ver perfil completo
- [ ] Tentar solicitar corrida (deve estar bloqueado)

**Frontend Admin:**
- [ ] Login com investor01 + ?demo=1
- [ ] Ver roteiro guiado (3 passos)
- [ ] Ver 4 KPIs no dashboard
- [ ] Ver gráfico de corridas
- [ ] Ver lista de motoristas
- [ ] Acessar /admin/system-status
- [ ] Tentar aprovar motorista (deve estar bloqueado)

**Geral:**
- [ ] Badge "Demonstração" visível em todas as páginas
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

**Versão:** 2.0 (Passenger + Admin)  
**Última atualização:** 03/02/2026  
**Próxima revisão:** Após feedback investidores
