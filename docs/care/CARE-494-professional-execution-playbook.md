# CARE-494 — Professional execution playbook

## Estado

Este documento transforma em plano técnico a estratégia de continuidade profissional do CARE.

Este PR não libera CARE oficial, não habilita CARE público, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera variáveis de produção e não faz deploy.

## Princípio central

O CARE deve avançar bem devagar, em camadas, sem tentar fazer o CARE funcionar de uma vez.

O CARE deve ser tratado como produto regulado dentro do sistema, não como uma variação simples de corrida.

O objetivo é evitar:

- erros;
- surpresas;
- retrabalho;
- travamento;
- Frankenstein;
- quebra do backend;
- regressão de CAR_NORMAL;
- regressão de MOTO;
- regressão de Premium;
- impacto indevido em wallet, pricing, dispatcher ou aceite.

## 1. Não mexer em produção agora

Não deve haver deploy do CARE ativo.

Não deve haver tentativa de liberar botão público.

O checkpoint atual deve ser congelado como base segura:

- main pode evoluir;
- produção continua sem CARE ativo;
- qualquer liberação futura exige autorização separada.

## 2. Criar uma matriz de fluxo oficial CARE

Antes de qualquer código operacional, deve existir uma matriz completa do fluxo oficial CARE:

- passageiro solicita CARE;
- gate de passageiro;
- elegibilidade do tipo CARE;
- preço/paridade;
- território/município/seguro;
- seleção de motorista;
- validação de veículo;
- oferta;
- aceite;
- wallet/split/settlement;
- auditoria;
- rollback.

Cada etapa deve documentar:

- entrada esperada;
- saída esperada;
- motivo de bloqueio;
- teste obrigatório;
- risco financeiro;
- risco jurídico/operacional.

Sem essa matriz, a implementação não deve avançar.

## 3. Separar modo observação de modo operação

Antes de operação real, deve existir um CARE shadow mode.

O shadow mode deve simular a decisão CARE sem criar operação real:

- o sistema simula a decisão CARE;
- registra o que teria acontecido;
- mas não cria corrida CARE real;
- não oferece para motorista;
- não mexe em wallet;
- não cobra passageiro;
- não altera produção operacional.

O shadow mode deve permitir observar:

- quantas solicitações seriam bloqueadas;
- por qual motivo;
- qual território falhou;
- qual motorista não era elegível;
- qual veículo não servia;
- qual preço seria aplicado.

## 4. Não misturar dispatcher, aceite, pricing e wallet no mesmo PR

Dispatcher, aceite, pricing e wallet não devem ser implementados juntos.

A evolução deve ser em blocos pequenos:

- PR A: contrato técnico do dispatcher CARE;
- PR B: dispatcher CARE em dry-run, sem oferta real;
- PR C: testes do dispatcher;
- PR D: contrato técnico do aceite CARE;
- PR E: aceite CARE em dry-run, sem assignment real;
- PR F: pricing/paridade CARE;
- PR G: wallet/settlement protegido;
- PR H: integração controlada em staging;
- PR I: deploy escuro, tudo desligado;
- PR J: piloto interno mínimo.

Nunca deve ser feito:

- dispatcher + aceite + pricing + wallet + app + deploy no mesmo pacote.

Esse tipo de mistura é o caminho clássico para quebrar backend.

## 5. Manter CARE como extensão, não como remendo

O CARE não deve ser implementado espalhando if CARE pelo sistema inteiro.

O desenho correto deve preservar o fluxo principal:

- rides-v2 continua sendo o fluxo principal;
- CARE entra por adaptadores/serviços próprios;
- dispatcher chama um validador CARE;
- aceite chama um validador CARE;
- pricing chama uma política CARE;
- wallet só executa depois de autorização oficial.

O objetivo é garantir:

- CAR_NORMAL não saber demais sobre CARE;
- MOTO não ser afetado;
- Premium não ser afetado;
- wallet não assumir corrida inválida;
- dispatcher não oferecer corrida sem elegibilidade.

## 6. Criar motivos oficiais de bloqueio

O código público para passageiro pode continuar simples:

- CARE_SERVICE_NOT_AVAILABLE.

Internamente, o sistema precisa ter motivos detalhados, como:

- CARE_PASSENGER_NOT_ALLOWLISTED;
- CARE_FLAGS_NOT_READY;
- CARE_DRIVER_NOT_QUALIFIED;
- CARE_VEHICLE_NOT_CAPABLE;
- CARE_TERRITORY_NOT_ALLOWED;
- CARE_CITY_NOT_ALLOWED;
- CARE_INSURANCE_NOT_CONFIRMED;
- CARE_PRICE_PARITY_FAILED;
- CARE_ACCEPTANCE_REVALIDATION_FAILED;
- CARE_WALLET_GUARD_FAILED.

Esses motivos internos evitam investigação no escuro e reduzem retrabalho.

## 7. Liberar apenas piloto mínimo

O primeiro piloto real, quando autorizado futuramente, deve ser pequeno:

- 1 território;
- 1 ou poucos passageiros internos;
- 1 ou poucos motoristas verificados;
- CARE_ASSISTED simples;
- sem wheelchair adaptada;
- preço igual à corrida comum equivalente;
- sem exposição pública ampla;
- rollback pronto.

Não deve haver abertura ampla ao público na primeira liberação.

## 8. Criar critérios objetivos de avanço e parada

Pode avançar se:

- testes passam;
- produção não foi alterada sem autorização;
- corridas normais seguem funcionando;
- wallet não foi afetada;
- dispatcher não oferece CARE inválido;
- aceite revalida tudo;
- rollback testado;
- logs mostram motivos claros.

Para tudo se:

- qualquer teste financeiro falhar;
- qualquer regressão em CAR_NORMAL aparecer;
- qualquer dúvida sobre seguro/município/território surgir;
- qualquer comportamento inesperado em wallet aparecer;
- qualquer deploy automático ocorrer sem controle.

## 9. Ordem profissional de continuidade

A sequência profissional deve ser:

- #494 — relatório executivo/técnico do checkpoint CARE atual;
- #495 — contrato técnico oficial do fluxo CARE;
- #496 — matriz de riscos e motivos de bloqueio;
- #497 — shadow mode de elegibilidade, sem operação real;
- #498 — dispatcher CARE dry-run;
- #499 — aceite CARE dry-run;
- #500 — pricing/paridade CARE;
- #501 — wallet/settlement guard CARE;
- #502 — staging/piloto interno simulado;
- #503 — deploy escuro com tudo desligado;
- #504 — piloto interno real mínimo, se autorizado.

## 10. Decisão técnica

A decisão técnica é não tentar ativar CARE agora.

A decisão técnica é construir capacidade operacional com travas, até chegar a um ponto em que ativar seja uma chave controlada, e não uma aposta.

O objetivo profissional é:

- quando o CARE for ativado, o sistema já sabe bloquear;
- auditar;
- explicar;
- reverter;
- preservar as corridas normais.

## Fora de escopo

Este PR não habilita CARE oficial, não expõe CARE ao passageiro, não altera app, não altera backend operacional, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera variáveis de produção e não faz deploy.
