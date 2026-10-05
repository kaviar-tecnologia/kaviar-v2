# CARE-505 — relatório de lacunas técnicas para liberar CARE oficial

## Estado

Este relatório consolida as lacunas técnicas que ainda impedem a liberação do CARE oficial.

Este PR é somente documental e de teste. Ele não libera CARE oficial, não habilita CARE público, não altera backend/src, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera app, não altera produção e não faz deploy.

## Conclusão executiva

O CARE ainda não está pronto para liberação oficial.

A decisão técnica atual permanece:

- `releaseReady=false`;
- `publicCareAvailable=false`;
- `officialCareAvailable=false`;
- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`;
- código público: `CARE_SERVICE_NOT_AVAILABLE`.

Mesmo que todas as release flags estejam ligadas em ambiente de teste, isso não autoriza operação real. O fluxo oficial ainda precisa de implementação transacional, revalidações, testes e autorização separada.

## Lacunas críticas

### 1. Entrada pública do passageiro

Lacuna:

- ainda não existe fluxo público CARE autorizado;
- passageiro com intenção CARE deve continuar bloqueado;
- `passengerId` vindo do body não pode autorizar CARE;
- o backend deve continuar usando somente o passageiro autenticado.

Bloqueio mantido:

- `CARE_SERVICE_NOT_AVAILABLE`.

Critério para fechar a lacuna:

- teste de bloqueio sem passageiro autenticado;
- teste ignorando `passengerId` no body;
- teste de bloqueio com flags incompletas;
- teste de bloqueio mesmo com allowlist quando fluxo oficial ainda não estiver pronto.

### 2. Gate de passageiro e flags

Lacuna:

- allowlist é preparação/observabilidade, não autorização;
- nenhuma flag isolada pode liberar CARE;
- as flags oficiais precisam ser avaliadas em conjunto;
- mesmo com flags true, a política atual ainda deve bloquear enquanto não houver fluxo oficial completo.

Flags obrigatórias:

- `CARE_PUBLIC_REQUEST_ENABLED`;
- `CARE_OFFICIAL_ENABLED`;
- `CARE_DISPATCH_ENABLED`;
- `CARE_DRIVER_ACCEPTANCE_ENABLED`;
- `CARE_AUDIT_STRICT_ENABLED`.

Critério para fechar a lacuna:

- teste de flags incompletas;
- teste de todas as flags true ainda bloqueando quando fluxo oficial não estiver implementado;
- teste de rollback por flags desligadas.

### 3. Tipo CARE inicial

Lacuna:

- o primeiro piloto deve ser restrito a `CARE_ASSISTED` simples;
- wheelchair adaptada e van adaptada devem continuar fora do primeiro piloto;
- tipo desconhecido ou não habilitado deve bloquear antes do dispatcher.

Critério para fechar a lacuna:

- teste de `CARE_ASSISTED` permitido somente no escopo autorizado;
- teste de wheelchair adaptada bloqueada;
- teste de van adaptada bloqueada;
- teste de tipo desconhecido bloqueado.

### 4. Território, município e seguro

Lacuna:

- CARE só pode operar em território previamente permitido;
- CARE só pode operar em município previamente verificado;
- dúvida regulatória municipal deve bloquear;
- dúvida de seguro deve bloquear;
- origem/destino fora da área validada deve bloquear antes da oferta.

Critério para fechar a lacuna:

- teste de território não permitido;
- teste de município não autorizado;
- teste de seguro não confirmado;
- teste de origem/destino fora da área validada.

### 5. Pricing e paridade não discriminatória

Lacuna:

- o piloto mínimo não pode cobrar mais por idade, deficiência ou mobilidade reduzida;
- preço CARE precisa ter paridade com a corrida comum equivalente;
- pricing CARE não pode afetar `CAR_NORMAL`, moto, Premium ou turismo;
- política de preço precisa ser explícita e auditável.

Critério para fechar a lacuna:

- teste de paridade com corrida comum equivalente;
- teste de ausência de acréscimo discriminatório;
- teste de regressão de `CAR_NORMAL`;
- teste de regressão de moto;
- teste de regressão de Premium.

### 6. Elegibilidade do motorista

Lacuna:

- motorista precisa estar verificado;
- motorista precisa ter qualificação CARE compatível;
- motorista precisa estar apto no território;
- qualificação vencida ou ausente deve bloquear;
- motorista comum não pode receber oferta CARE.

Critério para fechar a lacuna:

- teste de motorista não verificado;
- teste de motorista sem qualificação CARE;
- teste de motorista fora do território;
- teste de qualificação vencida;
- teste de motorista comum não receber oferta CARE.

### 7. Capacidade do veículo

Lacuna:

- veículo precisa cumprir os requisitos do tipo CARE;
- veículo sem capacidade exigida não pode receber oferta;
- veículo não validado deve bloquear;
- capacidade incompatível com o tipo CARE deve bloquear.

Critério para fechar a lacuna:

- teste de veículo incompatível;
- teste de veículo não validado;
- teste de mismatch tipo CARE versus veículo;
- teste de exclusão de wheelchair/van adaptada no primeiro piloto.

### 8. Dispatcher CARE

Lacuna:

- dispatcher CARE oficial ainda não deve criar oferta real;
- primeiro estágio operacional deve ser dry-run;
- dispatcher deve revalidar passageiro, tipo CARE, território, município, seguro, motorista, veículo, preço e flags;
- dispatcher CARE não pode afetar corridas comuns.

Critério para fechar a lacuna:

- teste de dry-run sem oferta real;
- teste de ausência de motorista elegível;
- teste de motorista inelegível bloqueado;
- teste de veículo incompatível bloqueado;
- teste de regressão de corrida comum;
- teste de rollback por flag desligada.

### 9. Aceite CARE

Lacuna:

- aceite CARE oficial ainda não deve gerar assignment real sem revalidação;
- aceite precisa revalidar tudo dentro da transação;
- aceite CARE não pode acionar wallet, pricing, notificações ou assignment se qualquer gate falhar;
- aceite CARE não pode afetar aceite comum.

Critério para fechar a lacuna:

- teste de revalidação completa no aceite;
- teste de motorista não rechecado;
- teste de veículo não rechecado;
- teste de território/município/seguro não rechecados;
- teste de aceite comum preservado.

### 10. Wallet, split e settlement

Lacuna:

- wallet não pode executar para CARE bloqueado;
- settlement não pode ocorrer sem autorização;
- payout CARE não pode ocorrer antes de corrida oficialmente autorizada;
- financeiro comum não pode sofrer regressão;
- erros financeiros devem parar avanço.

Critério para fechar a lacuna:

- teste de wallet bloqueado para CARE não autorizado;
- teste de settlement bloqueado;
- teste de ausência de payout CARE não autorizado;
- teste de regressão financeiro comum;
- teste de parada em estado inesperado de wallet.

### 11. Auditoria e observabilidade

Lacuna:

- toda decisão CARE crítica precisa de rastro;
- motivo interno de bloqueio precisa existir;
- shadow audit precisa permanecer rastreável;
- logs não podem expor dado sensível indevido;
- `CARE_AUDIT_STRICT_ENABLED` deve ser obrigatório para release.

Critério para fechar a lacuna:

- teste de decisão registrada;
- teste de motivo interno obrigatório;
- teste de shadow audit gravado;
- teste de ausência de dados sensíveis indevidos;
- teste de falha de auditoria strict bloqueando release.

### 12. Rollback

Lacuna:

- rollback precisa bloquear novas solicitações CARE;
- rollback precisa impedir novas ofertas CARE;
- rollback precisa impedir novos aceites CARE;
- rollback precisa manter corridas comuns funcionando;
- rollback precisa preservar logs para análise.

Critério para fechar a lacuna:

- teste de flags desligadas bloqueando CARE;
- teste de dispatcher não ofertando após rollback;
- teste de aceite bloqueado após rollback;
- teste de `CAR_NORMAL`, moto e Premium preservados;
- checklist de comunicação operacional.

## Sequência técnica recomendada após este relatório

A sequência segura ainda deve separar responsabilidades:

1. contrato final de implementação operacional;
2. criação transacional CARE ainda bloqueada por flag;
3. dispatcher CARE dry-run;
4. dispatcher CARE controlado;
5. aceite CARE dry-run;
6. aceite CARE controlado;
7. pricing/paridade CARE;
8. wallet/settlement guard;
9. E2E completo;
10. deploy escuro com tudo desligado;
11. autorização explícita para ativação controlada.

## Critérios globais de parada

O avanço deve parar se ocorrer qualquer item abaixo:

- teste financeiro falhando;
- regressão de `CAR_NORMAL`;
- regressão de moto;
- regressão de Premium;
- dispatcher ofertando CARE inválido;
- aceite sem revalidação;
- wallet executando para CARE bloqueado;
- pricing discriminatório;
- falta de evidência de seguro;
- falta de evidência municipal/territorial;
- alteração em produção sem autorização;
- deploy sem autorização explícita.

## Fora de escopo

Este PR não altera rotas.

Este PR não altera dispatcher.

Este PR não altera aceite.

Este PR não altera pricing.

Este PR não altera wallet.

Este PR não altera flags.

Este PR não cria migration.

Este PR não habilita CARE oficial.

Este PR não habilita CARE público.

Este PR não altera produção.

Este PR não faz deploy.

## Decisão

O CARE oficial continua bloqueado.

O próximo passo após este relatório deve ser escolhido entre:

- continuar documentação/contrato operacional;
- implementar o próximo componente em modo dry-run;
- parar e revisar a estratégia antes de código operacional.

Este relatório não autoriza ativação, deploy, flags em produção, operação real, oferta real, aceite real, pricing real ou wallet CARE.
