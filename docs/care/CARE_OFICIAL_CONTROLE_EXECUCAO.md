# KAVIAR CARE OFICIAL — Controle de Execução e Continuidade

Documento de controle para desenvolvimento, auditoria, liberação e operação do KAVIAR CARE oficial.

Objetivo: impedir perda de contexto, evitar pular etapas e permitir retomada segura mesmo se o computador desligar, o terminal fechar ou o chat for reiniciado.

---

## 1. Estado atual

Data-base: 2026-10-04.

### Produção

Backend publicado após PR #476:

- Commit: b7acd6f20fb71fe35b70d54462a1d1cbdc26ddf6

Frontend publicado após PR #478:

- Commit: 00caa3119fcc5909392ea238d7b3bea1c62ab670

### CARE administrativo

Concluído:

- Lista admin filtra motoristas por capacidades CARE.
- Rota real /api/admin/drivers retorna careSummary.
- Tela de motoristas foi compactada.
- Detalhes aparecem em linha expansível.
- Contraste visual foi ajustado.
- Motorista Aparecido Goes está administrativamente CARE verificado.

Ainda não liberado:

- CARE oficial para passageiro.
- Dispatcher CARE oficial.
- Aceite CARE oficial no app do motorista.
- Pricing CARE oficial.
- Ativação pública de CARE_ASSISTED.

---

## 2. PRs concluídos

### PR #476

Correção do filtro CARE na rota real do admin.

Resultado:

- Backend publicado.
- Frontend publicado.
- Produção validada.

### PR #477

Lista compacta de motoristas com detalhes expansíveis.

Resultado:

- Frontend publicado.
- Produção validada.

### PR #478

Melhoria de contraste visual da lista compacta.

Resultado:

- Frontend publicado.
- Produção validada.

---

## 3. Definição do produto

KAVIAR CARE é uma modalidade de corrida com acompanhamento e atenção adicional ao embarque, desembarque e deslocamento.

Não é:

- serviço médico;
- ambulância;
- remoção hospitalar;
- cuidador profissional de saúde;
- transporte de emergência.

Linguagem permitida:

- acompanhamento;
- apoio no embarque;
- apoio no desembarque;
- atenção adicional;
- cadeira dobrável;
- veículo compatível;
- motorista qualificado administrativamente.

---

## 4. Princípios obrigatórios

1. CARE oficial nasce desligado por padrão.
2. Nenhum CARE real pode ser liberado sem feature flag.
3. Motorista comum não pode receber corrida CARE.
4. Motorista CARE pendente não pode receber corrida CARE.
5. Motorista CARE verificado só pode receber corrida compatível.
6. Passageiro idoso, PCD ou com mobilidade reduzida não pode pagar mais caro apenas por sua condição.
7. Corrida comum, moto, premium e turismo não podem ser afetados.
8. Toda decisão crítica deve gerar log.
9. Nenhum merge sem checks verdes.
10. Nenhum deploy sem autorização explícita.

---

## 5. Flags planejadas

Flags sugeridas:

- CARE_ADMIN_ENABLED=true
- CARE_PUBLIC_REQUEST_ENABLED=false
- CARE_OFFICIAL_ENABLED=false
- CARE_DISPATCH_ENABLED=false
- CARE_DRIVER_ACCEPTANCE_ENABLED=false
- CARE_AUDIT_STRICT_ENABLED=true

Significado:

- CARE_ADMIN_ENABLED permite cadastro administrativo CARE.
- CARE_PUBLIC_REQUEST_ENABLED permite passageiro ver opção CARE.
- CARE_OFFICIAL_ENABLED autoriza criação real de CARE oficial.
- CARE_DISPATCH_ENABLED autoriza dispatcher CARE.
- CARE_DRIVER_ACCEPTANCE_ENABLED autoriza aceite específico CARE no motorista.
- CARE_AUDIT_STRICT_ENABLED exige logs e auditoria.

---

## 6. Modalidades planejadas

### CARE Simples

Para acompanhamento simples e atenção adicional.

Requisitos:

- motorista aprovado;
- qualificação CARE verificada;
- validade da qualificação no futuro.

### CARE Cadeira Dobrável

Para passageiro que leva cadeira dobrável no porta-malas.

Requisitos:

- requisitos do CARE Simples;
- treinamento de cadeira dobrável;
- porta-malas compatível;
- inspeção válida.

### CARE Adaptado

Para veículo realmente adaptado.

Requisitos:

- veículo verificado;
- capacidade de cadeira maior que zero;
- rampa/elevador verificado;
- fixação verificada;
- retenção verificada;
- documento de adaptação verificado;
- inspeção válida.

Observação: CARE Adaptado só deve ser prometido publicamente quando houver veículo real apto.

---

## 7. Fluxo completo desejado

1. Passageiro escolhe CARE.
2. Sistema mostra aviso de que não é serviço médico.
3. Passageiro informa requisitos.
4. Sistema valida feature flags.
5. Sistema cria requisitos CARE.
6. Pricing calcula sem discriminação por idade ou PCD.
7. Dispatcher busca motoristas online.
8. Filtro CARE valida motorista, veículo e datas.
9. Motorista recebe oferta CARE com requisitos.
10. Motorista aceita ou recusa.
11. Corrida acontece.
12. Logs e auditoria registram tudo.
13. Admin acompanha operação CARE.

---

## 8. Próximos PRs planejados

### PR #479 — Auditoria CARE oficial e documento técnico

Tipo:

- documentação;
- auditoria;
- mapeamento;
- sem ativar produção.

Objetivos:

- mapear arquivos atuais;
- mapear flags existentes;
- mapear bloqueios CARE;
- mapear tabelas já criadas;
- mapear testes existentes;
- identificar pontos de entrada de passageiro, dispatcher, motorista, admin, pricing e auditoria.

Proibido:

- ativar CARE oficial;
- alterar dispatcher real;
- alterar pricing real;
- alterar pagamentos;
- alterar banco sem necessidade;
- fazer deploy automático.

### PR #480 — Feature flags e bloqueios oficiais

Objetivo:

- garantir que o CARE real só funcione quando autorizado por flags.

### PR #481 — Solicitação CARE pelo passageiro

Objetivo:

- permitir montar pedido CARE de forma controlada, ainda sem despacho real se flags não permitirem.

### PR #482 — Dispatcher CARE

Objetivo:

- dispatcher só envia CARE para motorista compatível.

### PR #483 — Aceite motorista CARE

Objetivo:

- motorista vê claramente que é corrida CARE e seus requisitos.

### PR #484 — Auditoria final e piloto controlado

Objetivo:

- logs finais, rollback, validação ponta a ponta e liberação controlada.

---

## 9. Checklist antes de qualquer PR CARE

- [ ] Branch baseada em origin/main.
- [ ] git status --short limpo.
- [ ] PRs abertos verificados.
- [ ] Objetivo do PR definido em uma frase.
- [ ] Itens proibidos definidos.
- [ ] Confirmado se há alteração de banco.
- [ ] Confirmado se há alteração de backend.
- [ ] Confirmado se há alteração de frontend.
- [ ] Confirmado se há alteração de dispatcher.
- [ ] Confirmado se há alteração de pricing.
- [ ] Confirmado se há alteração de pagamentos.

---

## 10. Checklist antes de merge

- [ ] Build passou.
- [ ] Testes relevantes passaram.
- [ ] git diff --check sem erro.
- [ ] Checks GitHub verdes.
- [ ] Escopo revisado.
- [ ] Sem alteração fora do escopo.
- [ ] Sem ativação indevida de CARE oficial.
- [ ] Sem deploy automático.

---

## 11. Checklist antes de deploy

- [ ] PR mesclado na main.
- [ ] Commit completo registrado.
- [ ] Confirmado se é backend, frontend ou ambos.
- [ ] Confirmado se há Prisma.
- [ ] Autorização explícita de deploy recebida.
- [ ] Workflow correto disparado.
- [ ] Workflow terminou com sucesso.
- [ ] Produção validada.

---

## 12. Comandos úteis de retomada

Estado local:

- cd /home/goes/kaviar
- git status -sb
- git branch --show-current
- git log --oneline --decorate -5

PRs abertos:

- gh pr list --state open --limit 20

Backend em produção:

- curl -fsS https://api.kaviar.com.br/api/health | jq .

Últimos deploys backend:

- gh run list --workflow="deploy-backend.yml" --limit 5

Últimos deploys frontend:

- gh run list --workflow="deploy-frontend.yml" --limit 5

---

## 13. Ponto atual de execução

- [x] CARE admin funcional.
- [x] Motorista Aparecido Goes verificado administrativamente.
- [x] Lista admin compacta publicada.
- [x] Contraste visual publicado.
- [ ] PR #479 ainda não iniciado.
- [ ] Auditoria técnica CARE oficial ainda não concluída.
- [ ] CARE oficial ainda não liberado.
- [ ] Dispatcher CARE oficial ainda não liberado.
- [ ] Aceite motorista CARE oficial ainda não liberado.

Próximo passo:

Criar PR #479 — Auditoria CARE oficial e documento técnico.

---

## 14. Regra de ouro

Nenhuma etapa do CARE oficial deve avançar se houver:

- dúvida sobre impacto em corrida comum;
- dúvida sobre pricing;
- dúvida sobre dispatcher;
- dúvida sobre aceite;
- dúvida sobre pagamentos;
- testes falhando;
- logs inconclusivos;
- ausência de autorização expressa.

Em caso de dúvida: parar, diagnosticar, registrar e só depois continuar.
