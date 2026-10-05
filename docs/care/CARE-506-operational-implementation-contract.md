# CARE-506 — contrato técnico final de implementação operacional CARE

## Estado

Este documento define o contrato técnico final para uma futura implementação operacional do CARE oficial.

Este PR é somente documental e de teste. Ele não libera CARE oficial, não habilita CARE público, não altera backend/src, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não altera flags, não cria migration, não altera app, não altera produção e não faz deploy.

## Decisão atual

O CARE oficial continua bloqueado.

A decisão técnica permanece:

- `releaseReady=false`;
- `publicCareAvailable=false`;
- `officialCareAvailable=false`;
- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`;
- código público: `CARE_SERVICE_NOT_AVAILABLE`.

Este contrato não autoriza ativação, deploy, flags em produção, operação real, oferta real, aceite real, pricing real, wallet CARE ou settlement CARE.

## Invariantes globais

- fail-closed por padrão;
- passageiro autenticado é a única fonte de identidade;
- `passengerId` no body nunca autoriza CARE;
- allowlist é limitador ou observabilidade, não autorização isolada;
- nenhuma flag isolada libera CARE;
- flags oficiais precisam ser avaliadas em conjunto;
- CARE público não aparece antes de autorização explícita;
- dispatcher não oferta sem revalidação CARE;
- aceite não gera assignment sem revalidação CARE;
- pricing não pode cobrar acréscimo por idade, deficiência ou mobilidade reduzida;
- wallet não executa para CARE bloqueado;
- settlement não ocorre sem corrida oficialmente autorizada;
- rollback por flags precisa bloquear novas solicitações, ofertas e aceites;
- corridas comuns, moto, Premium e turismo não podem sofrer regressão;
- deploy em produção exige autorização expressa separada.

## Escopo inicial permitido para desenho operacional

O primeiro desenho operacional continua restrito a:

- piloto interno;
- passageiro explicitamente autorizado;
- `CARE_ASSISTED` simples;
- preço igual à corrida comum equivalente;
- território previamente validado;
- município previamente validado;
- seguro previamente confirmado;
- motorista verificado;
- qualificação CARE verificada;
- veículo compatível;
- auditoria ativa;
- rollback testado.

Fora do primeiro desenho:

- wheelchair adaptada;
- van adaptada;
- operação ampla;
- exposição pública irrestrita;
- preço adicional por idade, deficiência ou mobilidade reduzida;
- fallback para corrida comum quando o passageiro pediu CARE.

## Sequência obrigatória de implementação futura

A implementação operacional futura deve ser dividida em PRs pequenos e auditáveis:

1. criação transacional CARE ainda bloqueada por flag;
2. contrato de requisitos CARE por corrida;
3. gate de passageiro e flags em modo bloqueado;
4. dispatcher CARE dry-run sem oferta real;
5. dispatcher CARE controlado sem afetar corridas comuns;
6. aceite CARE dry-run sem assignment real;
7. aceite CARE controlado com revalidação transacional;
8. pricing CARE com paridade e não discriminação;
9. wallet e settlement guard;
10. auditoria e observabilidade completas;
11. E2E completo em ambiente descartável;
12. deploy escuro com tudo desligado;
13. autorização expressa para ativação;
14. autorização expressa separada para deploy.

Nenhum PR futuro deve misturar dispatcher, aceite, pricing, wallet, app e deploy no mesmo pacote.

## Contrato 1 — entrada pública e criação transacional

Regras obrigatórias:

- se não for CARE, fluxo comum deve seguir preservado;
- se for CARE e não estiver liberado, bloquear com `CARE_SERVICE_NOT_AVAILABLE`;
- `passengerId` do body deve ser ignorado para autorização;
- CARE só pode criar corrida oficial junto com requisitos CARE na mesma transação;
- nenhuma corrida CARE pode nascer sem requisitos;
- nenhuma corrida CARE pode acionar dispatcher antes de requisitos válidos;
- erro parcial deve fazer rollback completo.

Testes obrigatórios:

- bloqueio sem autenticação;
- bloqueio com `passengerId` forjado;
- bloqueio com flags incompletas;
- rollback quando criação de requisitos falhar;
- preservação de corrida comum;
- não chamar dispatcher antes de requisitos válidos.

## Contrato 2 — gate de passageiro e flags

Regras obrigatórias:

- allowlist sozinha não libera CARE;
- `CARE_PUBLIC_REQUEST_ENABLED` sozinha não libera CARE;
- `CARE_OFFICIAL_ENABLED` sozinha não libera CARE;
- `CARE_DISPATCH_ENABLED` sozinha não libera CARE;
- `CARE_DRIVER_ACCEPTANCE_ENABLED` sozinha não libera CARE;
- `CARE_AUDIT_STRICT_ENABLED` deve ser obrigatório para release;
- erro de consulta de allowlist deve bloquear;
- passageiro não autorizado deve bloquear;
- flags desligadas devem bloquear rollback.

Testes obrigatórios:

- passageiro ausente;
- passageiro fora da allowlist;
- erro de allowlist;
- flags incompletas;
- todas as flags true ainda bloqueando quando fluxo oficial estiver incompleto;
- rollback por flags desligadas.

## Contrato 3 — tipo CARE e requisitos

Regras obrigatórias:

- primeiro escopo operacional deve aceitar somente `CARE_ASSISTED` simples;
- wheelchair adaptada permanece fora do primeiro piloto;
- van adaptada permanece fora do primeiro piloto;
- tipo desconhecido bloqueia;
- tipo conhecido porém não habilitado bloqueia;
- requisitos CARE precisam ser explícitos e persistidos.

Testes obrigatórios:

- `CARE_ASSISTED` simples no escopo autorizado;
- wheelchair adaptada bloqueada;
- van adaptada bloqueada;
- tipo desconhecido bloqueado;
- requisitos ausentes bloqueando dispatcher.

## Contrato 4 — território, município e seguro

Regras obrigatórias:

- CARE só pode operar em território permitido;
- CARE só pode operar em município permitido;
- dúvida municipal bloqueia;
- dúvida de seguro bloqueia;
- seguro genérico não pode ser tratado automaticamente como evidência suficiente;
- origem/destino fora da área validada bloqueiam;
- território, município e seguro devem ser revalidados antes da oferta e antes do aceite.

Testes obrigatórios:

- território não permitido;
- município não autorizado;
- seguro não confirmado;
- origem/destino fora de área validada;
- revalidação no dispatcher;
- revalidação no aceite.

## Contrato 5 — pricing e paridade

Regras obrigatórias:

- piloto mínimo deve ter preço igual à corrida comum equivalente;
- não pode haver acréscimo por idade, deficiência ou mobilidade reduzida;
- pricing CARE deve ser auditável;
- falha de paridade bloqueia;
- pricing CARE não pode afetar `CAR_NORMAL`;
- pricing CARE não pode afetar moto;
- pricing CARE não pode afetar Premium;
- pricing CARE não pode afetar turismo.

Testes obrigatórios:

- paridade com corrida comum equivalente;
- ausência de acréscimo discriminatório;
- regressão de `CAR_NORMAL`;
- regressão de moto;
- regressão de Premium;
- regressão de turismo;
- erro de política bloqueando CARE.

## Contrato 6 — elegibilidade do motorista e veículo

Regras obrigatórias:

- motorista precisa estar verificado;
- motorista precisa ter qualificação CARE compatível;
- motorista precisa estar apto no território;
- qualificação vencida bloqueia;
- motorista comum não recebe oferta CARE;
- veículo precisa cumprir requisitos do tipo CARE;
- placa atual precisa bater com a placa verificada;
- veículo sem capacidade exigida bloqueia;
- veículo não validado bloqueia;
- troca de veículo ou placa exige nova validação.

Testes obrigatórios:

- motorista não verificado;
- motorista sem qualificação;
- qualificação vencida;
- motorista fora do território;
- veículo incompatível;
- veículo não validado;
- placa divergente;
- motorista comum não receber oferta CARE.

## Contrato 7 — dispatcher CARE

Regras obrigatórias:

- primeira implementação deve ser dry-run;
- dry-run não cria oferta real;
- dry-run registra o que teria acontecido;
- dispatcher real só pode ofertar para motorista elegível;
- dispatcher deve revalidar todos os gates antes de oferta;
- nenhum fallback para motorista comum;
- nenhum fallback para corrida comum;
- ausência de motorista elegível bloqueia sem oferta;
- dispatcher CARE não pode afetar corridas comuns;
- rollback por flag deve impedir novas ofertas.

Testes obrigatórios:

- dry-run sem oferta real;
- ausência de motorista elegível;
- motorista inelegível bloqueado;
- veículo incompatível bloqueado;
- território/município/seguro bloqueando oferta;
- corrida comum preservada;
- rollback impedindo oferta.

## Contrato 8 — aceite CARE

Regras obrigatórias:

- primeira implementação deve ser dry-run;
- dry-run não cria assignment real;
- aceite real só pode ocorrer depois de revalidação transacional;
- passageiro deve continuar autorizado;
- tipo CARE deve continuar permitido;
- território deve continuar permitido;
- município deve continuar permitido;
- seguro deve continuar aplicável;
- motorista deve continuar elegível;
- veículo deve continuar compatível;
- preço deve continuar válido;
- wallet guard deve aprovar antes de qualquer efeito financeiro;
- aceite CARE não pode afetar aceite comum.

Testes obrigatórios:

- dry-run sem assignment real;
- revalidação completa;
- motorista rechecado;
- veículo rechecado;
- território, município e seguro rechecados;
- preço rechecado;
- wallet guard rechecado;
- aceite comum preservado;
- rollback impedindo aceite.

## Contrato 9 — wallet, split e settlement

Regras obrigatórias:

- wallet não executa para CARE bloqueado;
- settlement não ocorre sem autorização;
- payout CARE não ocorre antes de corrida oficialmente autorizada;
- débito, crédito, incentivo e ledger territorial só executam após gates;
- financeiro comum não pode sofrer regressão;
- qualquer erro financeiro deve parar avanço;
- idempotência financeira deve ser preservada.

Testes obrigatórios:

- wallet bloqueado para CARE não autorizado;
- settlement bloqueado;
- payout não autorizado bloqueado;
- financeiro comum preservado;
- idempotência;
- parada por estado inesperado de wallet.

## Contrato 10 — auditoria, observabilidade e suporte

Regras obrigatórias:

- toda decisão crítica deve gerar rastro;
- motivo interno deve ser obrigatório;
- código público deve permanecer controlado;
- logs não devem expor dados sensíveis indevidos;
- auditoria precisa permitir explicar bloqueio, dry-run, oferta e aceite;
- `CARE_AUDIT_STRICT_ENABLED` deve bloquear release quando falhar;
- relatório administrativo não é controle de liberação operacional.

Testes obrigatórios:

- decisão registrada;
- motivo interno obrigatório;
- shadow audit preservado;
- logs sem dado sensível indevido;
- audit strict falhando bloqueia release.

## Contrato 11 — rollback

Regras obrigatórias:

- desligar flags deve bloquear novas solicitações CARE;
- desligar flags deve impedir novas ofertas;
- desligar flags deve impedir novos aceites;
- rollback não deve apagar auditoria;
- rollback não deve quebrar corridas comuns;
- rollback deve preservar suporte e rastreabilidade;
- produção só pode ser alterada com autorização separada.

Testes obrigatórios:

- flags desligadas bloqueando CARE;
- dispatcher não ofertando após rollback;
- aceite bloqueado após rollback;
- corridas comuns preservadas;
- auditoria preservada;
- comunicação operacional registrada.

## Critérios globais de parada

O avanço deve parar diante de qualquer item abaixo:

- teste financeiro falhando;
- regressão de `CAR_NORMAL`;
- regressão de moto;
- regressão de Premium;
- regressão de turismo;
- oferta CARE inválida no dispatcher;
- aceite sem revalidação;
- wallet executando para CARE bloqueado;
- settlement para CARE bloqueado;
- pricing discriminatório;
- falta de evidência de seguro;
- falta de evidência municipal;
- falta de evidência territorial;
- alteração em produção sem autorização;
- deploy sem autorização explícita;
- app expondo CARE antes da liberação pública;
- tentativa de usar allowlist como autorização oficial.

## Critérios mínimos antes de qualquer ativação controlada

Antes de qualquer ativação controlada, devem existir:

- PRs operacionais separados e aprovados;
- testes unitários;
- testes de integração;
- testes E2E em ambiente descartável;
- evidência de rollback;
- evidência de seguro;
- evidência municipal;
- evidência territorial;
- validação de motorista;
- validação de veículo;
- pricing com paridade;
- wallet guard;
- auditoria strict;
- autorização expressa para ativação;
- autorização expressa separada para deploy.

## Fora de escopo

Este PR não altera rotas.

Este PR não altera backend/src.

Este PR não altera dispatcher.

Este PR não altera aceite.

Este PR não altera pricing.

Este PR não altera wallet.

Este PR não altera flags.

Este PR não cria migration.

Este PR não altera app.

Este PR não altera produção.

Este PR não faz deploy.

Este PR não libera CARE oficial.

Este PR não habilita CARE público.

## Decisão final

O CARE oficial continua bloqueado.

O contrato #506 somente autoriza a próxima etapa de planejamento técnico. Ele não autoriza implementação operacional, merge operacional, ativação de flags, deploy, uso real, oferta real, aceite real, pricing real, wallet CARE ou settlement CARE.
