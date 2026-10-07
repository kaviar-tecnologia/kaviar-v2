# CARE-524 — plano de rollback do piloto CARE RJ

## Decisão

Este documento registra o plano específico de rollback do primeiro piloto controlado do KAVIAR CARE.

O piloto inicial considerado neste plano é o **CARE_ASSISTED simples**, em automóvel de passeio comum, com início candidato no Rio de Janeiro/RJ.

O Rio de Janeiro é apenas o território inicial do piloto. O KAVIAR CARE é estruturado para expansão progressiva em municípios de todo o Brasil, sempre condicionado à regulação local, seguro aplicável, elegibilidade operacional e autorização expressa.

Este documento não ativa CARE, não altera flags, não altera backend operacional, não cria corrida, não chama dispatcher, não permite aceite, não movimenta wallet, não gera cobrança, não faz pagamento e não faz deploy.

## Estado atual obrigatório

CARE permanece fail-closed.

- `CARE_SERVICE_NOT_AVAILABLE`
- `CARE_REQUIREMENTS_MISSING`
- `releaseReady=false`
- `publicCareAvailable=false`
- `officialCareAvailable=false`
- `operationAllowed=false`
- `dispatchAllowed=false`
- `acceptanceAllowed=false`
- `walletAllowed=false`

Nenhuma flag isolada pode liberar CARE enquanto a policy central mantiver o serviço bloqueado.

## Escopo do piloto coberto por este rollback

O rollback deste documento cobre somente o primeiro piloto controlado:

- modalidade: `CARE_ASSISTED` simples;
- território inicial: Rio de Janeiro/RJ;
- veículo: automóvel de passeio comum;
- sem ambulância;
- sem remoção médica;
- sem procedimento clínico;
- sem cuidador como serviço médico;
- sem van nesta etapa;
- sem veículo adaptado nesta etapa.

A futura expansão nacional deve usar o mesmo princípio de fail-closed e ter validação regulatória e securitária por território aplicável.

## Gatilhos de rollback imediato

Qualquer um dos eventos abaixo exige interrupção do piloto CARE:

- falha ou dúvida na elegibilidade do motorista;
- falha ou dúvida na compatibilidade do veículo;
- perda, ausência ou dúvida relevante sobre cobertura securitária;
- impedimento ou dúvida regulatória material no território;
- diferença de tarifa discriminatória por idade, deficiência, mobilidade ou morbidade;
- oferta para motorista não elegível;
- aceite sem revalidação de motorista, veículo, território e requisitos;
- criação, settlement, wallet, cobrança, repasse ou pagamento inesperado;
- comportamento CARE que possa afetar `CAR_NORMAL`, MOTO, Premium ou outro produto existente;
- erro técnico crítico no fluxo CARE;
- impossibilidade de confirmar o estado seguro do sistema.

Na dúvida, prevalece o bloqueio.

## Ação imediata de contenção

Quando um gatilho de rollback for confirmado:

1. impedir novas solicitações CARE;
2. impedir novos despachos CARE;
3. impedir novos aceites CARE;
4. impedir qualquer novo efeito em wallet, settlement, cobrança ou repasse CARE;
5. manter CARE indisponível até investigação e nova autorização.

O estado seguro esperado permanece:

- `releaseReady=false`;
- `publicCareAvailable=false`;
- `officialCareAvailable=false`;
- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`.

Este documento não autoriza alteração direta dessas propriedades em produção. Qualquer mudança operacional futura deve seguir PR, testes, checklist e autorização expressa.

## Corridas e ofertas existentes

Após o rollback:

- nenhuma nova corrida CARE pode ser criada;
- ofertas CARE pendentes devem ser canceladas de forma controlada;
- corrida ainda não iniciada não deve prosseguir para despacho ou aceite;
- nenhuma oferta deve ser reemitida automaticamente.

Se no futuro existir corrida CARE já iniciada no momento do rollback, ela não deve ser encerrada automaticamente de forma que possa colocar passageiro ou motorista em risco. O caso deve entrar em tratamento operacional específico e auditável.

## Wallet, settlement, cobrança e pagamentos

Rollback técnico não autoriza reversão financeira automática.

Em caso de possível efeito financeiro:

- bloquear novos efeitos CARE;
- preservar o registro original;
- auditar settlement, wallet, cobrança, repasse e pagamento;
- não gerar estorno automático;
- não gerar cobrança compensatória automática;
- não disparar pagamento;
- exigir decisão financeira separada antes de qualquer reversão.

O objetivo é evitar duplicidade, inconsistência contábil ou compensação sem evidência.

## Proteção dos demais produtos

O rollback CARE deve ser isolado.

Não deve:

- desligar `CAR_NORMAL`;
- desligar MOTO;
- desligar Premium;
- alterar turismo ou outros serviços;
- alterar pricing convencional;
- alterar wallet convencional;
- causar refatoração ampla para conter CARE.

Se uma correção necessária ameaçar esses fluxos, CARE permanece bloqueado até uma solução isolada e testada.

## Preservação de evidências

O rollback não deve apagar evidências.

Devem ser preservados, quando existirem:

- identificador da corrida;
- identificador da oferta;
- horários relevantes;
- território;
- motorista;
- veículo;
- requisitos CARE;
- decisão de elegibilidade;
- pricing;
- settlement;
- eventos de wallet;
- logs;
- auditoria;
- motivo do bloqueio ou rollback.

Nenhuma investigação deve depender de recriação manual de dados apagados.

## Seguro e regulação

Se seguradora, corretora ou autoridade pública indicar restrição incompatível com o piloto, CARE permanece fechado no escopo atingido.

Uma restrição territorial não deve ser automaticamente interpretada como proibição nacional.

A expansão para outros municípios ou estados exige avaliação própria de:

- regulamentação local;
- seguro aplicável;
- elegibilidade do motorista;
- compatibilidade do veículo;
- pricing sem discriminação;
- autorização operacional.

## Critérios para reativação após rollback

CARE não pode ser reativado apenas porque o sintoma desapareceu.

Antes de qualquer reativação deve existir:

1. causa identificada;
2. correção definida;
3. testes relevantes verdes;
4. regressão de produtos convencionais verde;
5. pricing sem discriminação validado;
6. dispatcher revalidado;
7. aceite revalidado;
8. wallet e settlement revalidados;
9. seguro aplicável confirmado;
10. regulação aplicável registrada;
11. rollback novamente revisado;
12. PR específico quando houver mudança de código;
13. autorização expressa para ativação;
14. autorização expressa separada para deploy quando aplicável.

Autorização anterior para documentação, teste, investigação ou dry-run não vale como autorização de reativação.

## Sequência operacional resumida

Em incidente ou dúvida material:

`detectar -> bloquear novos fluxos CARE -> preservar evidências -> auditar -> corrigir -> testar -> revisar -> obter nova autorização -> somente então considerar reativação`

Se qualquer etapa permanecer inconclusiva, CARE continua bloqueado.

## Critério de aceite do item 16 do CARE-514

O item 16 — rollback — pode ser considerado `go` no dry-run somente quando:

- este plano estiver versionado;
- existir teste de contrato garantindo seus bloqueios essenciais;
- o plano não autorizar alteração operacional;
- o plano preservar os demais produtos;
- o plano proibir reversão financeira automática;
- o plano exigir nova autorização para reativação e deploy.

Esse `go` é apenas do item de planejamento de rollback. Não significa `go` do piloto, não significa liberação pública e não elimina pendências de seguro, regulação, readiness operacional ou motorista/veículo.

## Proibições

Este plano não pode ser usado como autorização para:

- ativar CARE público;
- ativar CARE oficial;
- criar corrida CARE real;
- chamar dispatcher real;
- ofertar corrida real;
- permitir aceite real;
- alterar flags em produção;
- movimentar wallet;
- gerar cobrança;
- fazer estorno automático;
- fazer repasse;
- disparar pagamento;
- alterar produção;
- fazer deploy.

## Resultado

O rollback do piloto RJ fica formalmente definido como mecanismo de contenção fail-closed, isolado do restante da KAVIAR e preparado para uma futura expansão nacional controlada.

CARE permanece bloqueado até que todos os demais critérios aplicáveis estejam verdes e exista autorização expressa específica.
