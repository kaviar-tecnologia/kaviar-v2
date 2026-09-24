# Gestor Territorial KAVIAR — Modelo Comercial v1

> **SUPERADO / NÃO UTILIZAR PARA NOVAS CONTRATAÇÕES.** Mantido apenas como histórico. A política vigente está documentada na versão v1.1 e no Contrato de Parceria Operacional Territorial v1.1. Esta versão antiga contém referências a taxa de entrada e regras financeiras que não representam a política atual.

**Documento conceitual/comercial — KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA**
**CNPJ: 67.783.601/0001-99**
**Produto: KAVIAR — Plataforma de mobilidade urbana comunitária**

> ⚠️ Este documento é base conceitual/comercial. Não constitui contrato jurídico final. Deve ser revisado por advogado antes de formalização com qualquer parceiro.

---

## A) Definição

O **Gestor Territorial KAVIAR** é um parceiro comercial autônomo que presta apoio operacional de captação, gestão local e acompanhamento territorial para a plataforma KAVIAR em uma área geográfica definida.

A relação entre o Gestor Territorial e a KAVIAR/KAVIAR é de **parceria comercial e prestação de apoio operacional**, sem constituir franquia, licença territorial definitiva, representação comercial exclusiva ou vínculo empregatício.

---

## B) Diferença entre Captador e Gestor

| Aspecto | Operador Territorial Captador | Gestor Territorial KAVIAR |
|---------|-------------------------------|---------------------------|
| Perfil | Pessoa física (CPF) | Preferencialmente PJ (CNPJ/MEI/ME/LTDA) |
| Contrato | Termo digital v1.0-captador | Contrato formal de parceria |
| Taxa de entrada | Nenhuma | Taxa de validação/cadastro |
| Atuação | Indicar motoristas, acompanhar métricas | Coordenar operação local, captar parceiros, acompanhar suporte |
| Coordenação | Não coordena | Pode coordenar captadores |
| Financeiro | Bônus por indicação (regra do sistema) | Repasse percentual territorial conforme contrato |
| Acesso ao painel | Reduzido (motoristas, corridas, indicação, contrato) | Ampliado (parceiros, comércios, pet, particular, relatórios) |
| Exclusividade | Não | Não automática (possível por contrato + performance) |

---

## C) Responsabilidades do Gestor Territorial

O Gestor Territorial KAVIAR compromete-se a:

1. **Captar motoristas** para a plataforma no território de atuação;
2. **Captar passageiros** e divulgar o KAVIAR localmente;
3. **Identificar e cadastrar parceiros comerciais** (associações, condomínios, comércios);
4. **Apoiar treinamento operacional** de motoristas e captadores;
5. **Acompanhar a operação local** (corridas, suporte, ocorrências);
6. **Manter comunicação ativa** com a central KAVIAR;
7. **Respeitar as regras da plataforma** e as diretrizes da KAVIAR;
8. **Emitir documentação fiscal** quando aplicável (NFS-e, RPA ou equivalente);
9. **Manter sigilo** sobre informações e dados acessados no painel.

---

## D) Limites do Gestor Territorial

O Gestor Territorial **NÃO** tem poder para:

- Aprovar ou rejeitar motoristas de forma definitiva;
- Alterar preços, taxas, comissões ou regras financeiras da plataforma;
- Cobrar valores em nome do KAVIAR sem autorização formal por escrito;
- Realizar pagamentos ou movimentar recursos financeiros da plataforma;
- Alterar configurações técnicas (dispatch, push, geofence, feature flags);
- Criar outros gestores territoriais;
- Acessar dados de territórios que não sejam o(s) seu(s);
- Tomar decisões que vinculem juridicamente a KAVIAR perante terceiros;
- Conceder exclusividade, descontos ou condições especiais sem aprovação da central.

---

## E) Atividades permitidas

| Atividade | Status |
|-----------|--------|
| Indicar motoristas via link de referência | ✅ |
| Divulgar KAVIAR no território | ✅ |
| Captar parceiros comerciais (rascunho/draft) | ✅ |
| Cadastrar comércios locais (rascunho) | ✅ |
| Identificar e registrar associações | ✅ |
| Treinar motoristas sobre uso do app | ✅ |
| Acompanhar métricas do território no painel | ✅ |
| Acompanhar indicações KAVIAR Pet | ✅ |
| Acompanhar solicitações KAVIAR Particular | ✅ |
| Ver relatório financeiro do território (somente leitura) | ✅ |
| Aprovar vinculação de motorista ao território (link_request) | ✅ |
| Listar e acompanhar captadores vinculados ao território | ✅ |
| Usar a marca KAVIAR conforme diretrizes aprovadas | ✅ |

---

## F) Atividades proibidas

| Atividade | Status |
|-----------|--------|
| Alterar preços, taxas ou créditos | ❌ |
| Aprovar motorista de forma definitiva | ❌ |
| Cobrar motoristas, passageiros ou parceiros em nome do KAVIAR | ❌ |
| Prometer aprovação, exclusividade ou benefícios não autorizados | ❌ |
| Alterar comissão ou repasse | ❌ |
| Acessar dados de outro território | ❌ |
| Se apresentar como funcionário, sócio ou representante legal da KAVIAR | ❌ |
| Subcontratar sem autorização | ❌ |
| Criar material de marketing sem aprovação | ❌ |
| Compartilhar dados pessoais de motoristas/passageiros com terceiros | ❌ |

---

## G) Modelo financeiro inicial

### Fluxo de receita

```
Motorista completa corrida
→ Passageiro paga (ou crédito é consumido)
→ KAVIAR/KAVIAR recebe/controla receita principal
→ Sistema calcula taxa da plataforma (7-20% conforme território)
→ Sistema aplica split territorial:
    • KAVIAR (matriz): 60% da taxa
    • Regional (gestor): 40% da taxa
→ Acumula mensalmente
→ SUPER_ADMIN calcula repasse → aprova → registra pagamento
→ Gestor recebe via PIX/transferência bancária
```

### Regras

- O KAVIAR é o recebedor/controlador principal de toda receita;
- O Gestor NÃO recebe diretamente de motoristas, passageiros ou parceiros;
- O repasse é calculado pelo sistema, aprovado pela central e pago mensalmente;
- O percentual (40% é referência inicial) pode variar por contrato e performance;
- Mínimo para liberação de repasse: a definir (ex: R$ 50);
- O Gestor deve emitir NFS-e ou documento fiscal equivalente para receber.

---

## H) Taxa de validação/cadastro

| Item | Proposta |
|------|----------|
| **Valor** | R$ 297,00 (sugestão) |
| **Objetivo** | Validar interesse real, cobrir análise cadastral e onboarding |
| **O que NÃO é** | Não é taxa de franquia, não é mensalidade, não é investimento com retorno garantido |
| **Reembolsável?** | Não, exceto se o KAVIAR recusar o cadastro sem motivo |
| **Pagamento** | PIX ou boleto antes da ativação |
| **Inclui** | Análise cadastral, ativação do painel de gestor, treinamento básico, material de apoio |

### Atenção jurídica

A taxa de validação deve ser documentada como:
- "Taxa de análise cadastral e ativação de acesso"
- Emitir recibo ou nota de serviço
- NÃO chamar de "taxa de franquia" ou "licença"

---

## I) Regras de território

1. O território é definido pelo KAVIAR com base em cidade, região administrativa, bairros ou comunidades;
2. O território define a **área de atuação** do Gestor, não propriedade;
3. O KAVIAR pode atuar diretamente no território a qualquer momento;
4. O KAVIAR pode designar outros gestores ou captadores no mesmo território se julgar necessário;
5. Dados de desempenho do território são visíveis ao Gestor conforme painel disponibilizado;
6. O tamanho e abrangência do território podem ser ajustados conforme necessidade operacional.

---

## J) Não exclusividade automática

O Gestor Territorial **NÃO** recebe exclusividade automática sobre o território.

Exclusividade poderá ser avaliada caso o Gestor:
- Mantenha performance consistente por período mínimo (ex: 6 meses);
- Atinja metas operacionais definidas em contrato;
- Não tenha ocorrências de descumprimento;
- Seja aprovado pela diretoria da KAVIAR.

Mesmo com exclusividade, o KAVIAR mantém direito de operar diretamente e de rescindir a exclusividade por descumprimento.

---

## K) Suspensão e cancelamento

A KAVIAR/KAVIAR pode suspender ou cancelar o acesso do Gestor Territorial em caso de:

- Fraude ou tentativa de fraude;
- Cobrança indevida em nome do KAVIAR;
- Descumprimento das regras deste documento;
- Inatividade prolongada sem justificativa (ex: 60 dias);
- Conduta incompatível com valores do KAVIAR;
- Risco à operação, marca ou segurança da plataforma;
- Solicitação expressa do Gestor (rescisão voluntária).

A suspensão pode ser imediata quando houver urgência. O cancelamento definitivo será comunicado com antecedência mínima de 15 dias quando não houver urgência.

---

## L) Uso da marca KAVIAR

O Gestor Territorial pode:
- Mencionar que é "Gestor Territorial KAVIAR" em comunicações locais;
- Usar logotipo e materiais fornecidos pelo KAVIAR;
- Identificar-se como parceiro em conversas de captação.

O Gestor Territorial **NÃO** pode:
- Criar materiais de marketing sem aprovação prévia;
- Alterar logotipo, cores ou identidade visual;
- Usar a marca em contextos não autorizados;
- Registrar domínios, perfis ou marcas contendo "KAVIAR".

---

## M) Confidencialidade e LGPD

O Gestor Territorial deve:
- Manter sigilo sobre dados pessoais de motoristas, passageiros e parceiros;
- Não compartilhar informações acessadas no painel com terceiros;
- Respeitar a Lei Geral de Proteção de Dados (13.709/2018);
- Usar os dados apenas para finalidades operacionais autorizadas;
- Comunicar imediatamente qualquer incidente de segurança ou vazamento.

Violação de confidencialidade constitui motivo para cancelamento imediato e pode gerar responsabilização civil.

---

## N) Necessidade de contrato jurídico posterior

Este documento é base conceitual/comercial.

Para formalização da relação com qualquer Gestor Territorial, será necessário:

1. **Contrato de Parceria Comercial** — redigido ou revisado por advogado;
2. **Termo de Confidencialidade e LGPD** — específico;
3. **Documentação do Gestor** — CNPJ, contrato social, documentos pessoais do responsável;
4. **Comprovante de taxa de validação** — recibo ou nota fiscal;
5. **Aceite digital no painel** — registro de data, IP e versão do termo.

---

## O) Próximos passos técnicos (futuros, não implementar agora)

| Fase | Descrição | Dependência |
|------|-----------|-------------|
| G1 | Este documento (conceitual) | ✅ Feito |
| G2 | Contrato jurídico formal | Advogado |
| G3 | Role `TERRITORIAL_MANAGER` no sistema | Contrato pronto |
| G4 | Painel ampliado (ManagerHome) | G3 |
| G5 | Taxa de validação/cadastro (registro no sistema) | G2 |
| G6 | Relatório financeiro territorial | G4 |
| G7 | Coordenação de captadores | G4 |
| G8 | Piloto com 1 gestor real | G2 + G3 + G4 |

---

## Assinaturas futuras

```
_________________________________
KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA
CNPJ: 67.783.601/0001-99
Produto: KAVIAR

_________________________________
Gestor Territorial:
Nome:
CNPJ/CPF:
Território:
Data:
```

---

*Versão: v1-conceitual | Data: Junho/2026 | Status: Documento base para revisão jurídica*
