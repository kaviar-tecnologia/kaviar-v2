# Sumário Executivo - Captação Investimento Anjo
**Empresa:** KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA (CNPJ: 67.783.601/0001-99)  
**Produto:** Kaviar - Mobilidade Urbana para Comunidades  
**Estágio:** Pré-lançamento (produto funcional, validação técnica completa)  
**Data:** 03 de Fevereiro de 2026

**Veículo jurídico atual:** KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA (CNPJ 67.783.601/0001-99)  
**Estrutura planejada:** Criação de SPE/empresa dedicada ao Kaviar após a rodada (definir com contador/advogado)

---

## 🎯 O Pedido

**R$ 50.000** (10 cotas de R$ 5.000) para lançamento piloto  
**Contrapartida:** 10% equity (1% por cota)  
**Valuation pré-money:** R$ 450.000  
**Uso:** Regularização (40%) + Produto (30%) + Go-to-market (30%)

---

## ❌ O Problema

**1,4 milhões de pessoas** vivem em comunidades no Rio de Janeiro, mas são mal atendidas por apps de mobilidade:

- Motoristas de Uber/99 evitam entrar (medo, desconhecimento)
- GPS impreciso (endereços inexistentes ou errados)
- Falta de confiança mútua (motorista externo ↔ passageiro local)
- Mototáxi informal (sem segurança, rastreamento ou garantias)

**Resultado:** População depende de transporte público precário ou soluções informais.

---

## ✅ A Solução

**Kaviar:** Plataforma de mobilidade com motoristas **da própria comunidade**.

**Diferenciais:**
1. **Geofencing preciso** - 162 bairros mapeados (PostGIS)
2. **Motoristas locais** - Conhecem a região, geram confiança
3. **Governança comunitária** - Líderes locais como moderadores
4. **Comissão justa** - 18% (vs 25% Uber) = mais para motorista

**Status:** Produto funcional em AWS (backend + frontend web), mobile MVP em desenvolvimento (escopo definido, entrega por marcos).

---

## 📊 Mercado (Metodologia)

### TAM (Total Addressable Market) — Brasil
**TAM (GMV - valor transacionado):** R$ 0,9–1,8 bi/ano (estimado)

**Metodologia (cenário conservador):**
```
População em comunidades: 13 milhões (IBGE 2022)
× Penetração apps mobilidade: 5% (estimado, vs 25% geral)
× Corridas/mês: 8 (2/semana)
× Ticket médio: R$ 15
= 650.000 usuários × 8 corridas × R$ 15
= R$ 78M/mês (GMV)
= R$ 936M/ano (GMV)
```

**Receita potencial da plataforma (take rate 18%):**
- R$ 936M/ano × 18% = **R$ 168M/ano**

**Cenário otimista (10% penetração):**
- GMV: **R$ 1,87 bi/ano**
- Receita potencial (18%): **R$ 336M/ano**

**Fontes:**
- População: IBGE Censo 2022 + DataFavela 2023
- Penetração: Estimativa baseada em renda (R$ 1.500-3.000/mês)
- Ticket/frequência: Benchmarks Uber/99 ajustados para distâncias menores

### SAM (Serviceable Available Market) — Rio de Janeiro
**SAM (GMV):** R$ 120-240M/ano  
**Receita potencial (18%):** R$ 22-43M/ano

**Cálculo:**
- 1,4 milhões habitantes em comunidades (22% da população RJ)
- Mesma metodologia aplicada (5-10% penetração)

### SOM (Serviceable Obtainable Market) — Ano 1
**SOM (GMV):** R$ 7,2M/ano  
**Receita potencial (18%):** R$ 1,3M/ano

**Cálculo:**
- 10 comunidades piloto (100.000 habitantes)
- 5% penetração (5.000 usuários)
- 40.000 corridas/mês × R$ 15 = R$ 600k/mês GMV

---

## 💰 Modelo de Receita

**Principal:** Comissão por corrida (18%)

**Secundário:**
- Assinaturas premium: R$ 29,90/mês
- Turismo (guias locais): 25% comissão
- Cuidado de idosos: R$ 499/mês (contratos)

### Unit Economics (Estimado)

| Métrica | Valor | Nota |
|---------|-------|------|
| Ticket médio | R$ 15 | Baseado em distâncias curtas |
| Take rate | 18% | Receita por corrida: R$ 2,70 |
| CAC | R$ 30-50 | Marketing local + incentivos |
| Corridas para payback | 11-18 | CAC ÷ R$ 2,70 |
| Churn mensal | 5-8% | Estimado (validar no piloto) |
| LTV (12 meses) | R$ 200-300 | 8 corridas/mês × 12 × R$ 2,70 |
| LTV/CAC | 4-10x | Saudável se > 3x |

**Nota:** Números a validar no piloto (Mês 1-3).

---

## 📈 Cenários de Retorno (3 Anos)

### Cenário Conservador
**Assunções:**
- 10 comunidades (Ano 1) → 30 (Ano 2) → 80 (Ano 3)
- 3% penetração
- 1,5 corridas/semana
- Churn 8%

**Resultado Ano 3:**
- Receita: R$ 8-10 M
- EBITDA: R$ 3-4 M (35% margem)
- Valuation: R$ 20-30 M (3-4x receita)
- **ROI investidor:** 20-30x

### Cenário Base
**Assunções:**
- 10 → 50 → 150 comunidades
- 5% penetração
- 2 corridas/semana
- Churn 5%

**Resultado Ano 3:**
- Receita: R$ 15-20 M
- EBITDA: R$ 7-10 M (50% margem)
- Valuation: R$ 50-80 M (3-4x receita)
- **ROI investidor:** 50-80x

### Cenário Otimista
**Assunções:**
- 10 → 80 → 250 comunidades
- 8% penetração
- 3 corridas/semana
- Churn 3%

**Resultado Ano 3:**
- Receita: R$ 30-40 M
- EBITDA: R$ 18-24 M (60% margem)
- Valuation: R$ 120-160 M (4x receita)
- **ROI investidor:** 120-160x

**O que precisa acontecer:**
1. Piloto validar unit economics (Mês 1-3)
2. Expansão RJ sem degradar métricas (Mês 4-12)
3. Replicar em SP com sucesso (Ano 2)
4. Manter churn < 5% e CAC < R$ 50

---

## 🏆 Concorrência (Matriz de Diferenciação)

| Dimensão | Uber/99 | Kaviar |
|----------|---------|--------|
| **Forças deles** | Marca, capital, tecnologia madura, escala | Foco 100% comunidades, relacionamento local |
| **Forças nossas** | Mercado de massa (classes A/B/C) | Nicho não atendido (comunidades) |
| **Diferencial defensável** | Network effect nacional | Geofencing + governança local + confiança |

**Por que não copiam?**
- Margens menores (18% vs 25%)
- Operação complexa (líderes comunitários)
- Não é core business deles
- Barreira de entrada: relacionamento local (anos para construir)

---

## ✅ Prova: Produto Operacional

### Evidências Técnicas
```
Endpoint de saúde:
GET https://api.kaviar.com.br/api/health

Response:
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "uptime": "72h"
}
```

### Infraestrutura AWS (Custos Reais - Jan 2026)
```
ECS Fargate (2 containers):  $68,40
RDS PostgreSQL (db.t3.micro): $18,20
S3 + CloudFront:              $7,30
ALB:                          $22,50
Data Transfer:                $4,10
────────────────────────────────────
Total:                        $120,50/mês
```

### Geofencing
- **162 bairros** mapeados (Rio de Janeiro)
- **PostGIS** (extensão geoespacial PostgreSQL)
- **~200 horas** de trabalho (pesquisa + validação)
- Fonte: OpenStreetMap + Data.Rio + validação manual

### Código
- **GitHub:** kaviar-tecnologia/kaviar-v2 (privado)
- **28.000 linhas** de código (TypeScript + React)
- **500+ commits** (6 meses)
- **Build:** ✅ Sem erros

---

## 💵 Uso dos R$ 50.000

### Regularização (R$ 20.000 - 40%)
- Anatel: R$ 10.000
- Bancos (dívidas): R$ 8.000
- CNPJ/Impostos: R$ 2.000

### Produto (R$ 15.000 - 30%)
- Mobile developer (2 meses): R$ 10.000
- Testes + QA: R$ 3.000
- Infraestrutura (3 meses): R$ 2.000

### Go-to-Market (R$ 15.000 - 30%)
- Marketing local (Rocinha): R$ 7.000
- Incentivos motoristas (50 × R$ 100): R$ 5.000
- Eventos comunitários: R$ 3.000

---

## 🎯 Milestones (90 Dias)

### Mês 1: Regularização + Finalização
- [ ] CNPJ reativado
- [ ] Mobile app publicado (App Store + Play Store)
- [ ] 50 motoristas cadastrados (Rocinha)

### Mês 2: Lançamento Piloto
- [ ] 500 usuários cadastrados
- [ ] 1.000 corridas realizadas
- [ ] NPS > 50

### Mês 3: Validação
- [ ] Unit economics validado (CAC, LTV, churn)
- [ ] 2.000 corridas/mês
- [ ] Decisão: escalar ou pivotar

**Critério de sucesso:** LTV/CAC > 3x e NPS > 50

---

## 📞 Próximos Passos

### Para Investidores Interessados

**1. Demo de 10 minutos** (agendar)
- Produto funcionando (web + mobile)
- Geofencing ao vivo
- Dashboard admin

**2. Documentação completa** (enviar)
- Relatório Técnico (20 pág)
- Análise de Mercado (25 pág)
- Due Diligence Técnica (30 pág)
- FAQ Investidor (15 perguntas)

**3. Due diligence** (acesso)
- Código GitHub (read-only)
- AWS Console (read-only)
- Reunião com fundador

**4. Contrato** (com advogado)
- Termos de investimento
- Direitos dos investidores
- Milestones e governança

---

## 📧 Contato

**Fundador:** [Seu Nome]  
**Email:** [seu-email]  
**WhatsApp:** [seu-telefone]  
**LinkedIn:** [seu-linkedin]

**Resposta em:** 24-48 horas

---

## ⚠️ Disclaimers

1. **Estágio:** Pré-lançamento. Produto funcional, mas sem tração comercial.
2. **Projeções:** Baseadas em estimativas e benchmarks. Resultados reais podem variar.
3. **Fontes:** Dados de mercado citam fontes quando disponíveis. Estimativas marcadas claramente.
4. **Risco:** Investimento em startup early-stage é de alto risco. Possibilidade de perda total.
5. **Regulação:** Empresa em processo de regularização (parte do uso dos recursos).

---

**"Mobilidade para todos, tecnologia para comunidades."**

---

**Versão:** 2.0 (Revisada para credibilidade)  
**Preparado por:** Kiro (AWS AI Assistant)  
**Confidencial:** Uso exclusivo para investidores qualificados
