# CARE-511 — manifesto de evidências para liberação CARE

## Decisão

Este documento define o manifesto mínimo de evidências exigido antes de qualquer liberação operacional futura do CARE.

A existência de código, flags, testes unitários ou intenção operacional não é evidência suficiente para habilitar CARE real. Cada etapa precisa deixar rastro verificável, revisável e auditável.

## Estado atual

CARE continua bloqueado.

- `CARE_SERVICE_NOT_AVAILABLE`
- `CARE_REQUIREMENTS_MISSING`
- `releaseReady=false`
- `publicCareAvailable=false`
- `officialCareAvailable=false`
- `operationAllowed=false`
- `dispatchAllowed=false`
- `acceptanceAllowed=false`
- `walletAllowed=false`

## Regra central

Nenhuma liberação CARE pode avançar sem um pacote de evidências contendo:

- identificador da evidência;
- data e hora;
- ambiente verificado;
- responsável técnico;
- responsável pela revisão;
- fonte verificável;
- resultado observado;
- risco residual;
- decisão tomada;
- rollback aplicável.

## Evidência 1 — integridade de código

Deve existir evidência de:

- PR específico;
- diff revisado;
- arquivos alterados listados;
- ausência de alteração fora do escopo;
- testes locais;
- checks remotos verdes;
- commit identificado;
- merge controlado.

## Evidência 2 — bloqueio atual preservado

Deve existir evidência de que, antes da liberação:

- CARE público segue bloqueado;
- CARE oficial segue bloqueado;
- dispatcher segue bloqueado;
- aceite segue bloqueado;
- wallet segue bloqueada;
- pagamentos seguem bloqueados;
- readiness administrativo mostra estado fail-closed.

## Evidência 3 — autorização de escopo

Deve existir evidência de:

- fluxo a liberar;
- território autorizado;
- usuários autorizados;
- janela de execução;
- limites do piloto;
- critérios de interrupção;
- autorização expressa do proprietário.

## Evidência 4 — território, gestor e contrato

Deve existir evidência de:

- território existente;
- território ativo para o escopo;
- gestor elegível;
- contrato aplicável;
- documentos pendentes ou concluídos;
- status financeiro do gestor;
- trilha administrativa.

## Evidência 5 — passageiro e solicitação

Deve existir evidência de:

- passageiro autenticado;
- `passengerId` originado do contexto autenticado;
- ausência de `passengerId` aceito pelo body;
- requisitos CARE declarados;
- bloqueio para requisito ausente;
- resposta pública controlada.

## Evidência 6 — motorista e veículo

Deve existir evidência de:

- motorista verificado;
- qualificação CARE válida;
- veículo compatível;
- capacidade operacional compatível;
- acessibilidade compatível;
- bloqueio para motorista não elegível;
- bloqueio para veículo incompatível.

## Evidência 7 — pricing sem discriminação

Deve existir evidência de:

- ausência de tarifa discriminatória por idade;
- ausência de tarifa discriminatória por deficiência;
- ausência de tarifa discriminatória por mobilidade;
- acréscimos vinculados somente a serviço real, tempo, distância ou categoria permitida;
- regressão contra CAR, MOTO e Premium;
- cálculo financeiro auditável.

## Evidência 8 — dispatcher e aceite

Deve existir evidência de:

- dispatcher filtrando somente motoristas elegíveis;
- oferta restrita ao piloto autorizado;
- aceite validando motorista, veículo, território e requisitos;
- bloqueio de aceite incompatível;
- auditoria de oferta e aceite;
- rollback de dispatcher e aceite.

## Evidência 9 — wallet, repasse e pagamentos

Deve existir evidência de:

- wallet autorizada;
- cálculo de repasse validado;
- settlement autorizado;
- reconciliação testada;
- ausência de pagamento real sem autorização expressa;
- plano de reversão financeira;
- trilha financeira auditável.

## Evidência 10 — produção e observabilidade

Deve existir evidência de:

- ambiente de produção identificado;
- versão publicada identificada;
- health check conferido;
- logs disponíveis;
- métrica de erro disponível;
- readiness administrativo conferido;
- plano de rollback técnico;
- confirmação de ausência de deploy não autorizado.

## Evidência 11 — aceite jurídico, financeiro e operacional

Deve existir evidência de:

- revisão jurídica;
- revisão financeira;
- revisão operacional;
- riscos conhecidos;
- riscos aceitos;
- riscos recusados;
- decisão final registrada.

## Evidência 12 — fechamento pós-liberação

Após qualquer liberação futura, deve existir evidência de:

- versão final publicada;
- checks pós-deploy;
- ausência de erro crítico;
- comportamento real observado;
- impacto financeiro observado;
- rollback não necessário ou rollback executado;
- decisão de manter, pausar ou reverter.

## Proibição

É proibido usar como evidência suficiente:

- print isolado sem contexto;
- teste local sem commit;
- commit sem PR;
- PR sem checks verdes;
- deploy sem versão confirmada;
- variável alterada manualmente;
- autorização dada para outro escopo;
- autorização verbal não registrada;
- ausência de erro como prova de segurança.

## Fora de escopo

Este PR não altera código operacional, não altera schema Prisma, não cria migration, não faz deploy, não altera produção, não habilita CARE público, não habilita CARE oficial, não mexe em dispatcher, aceite, pricing, wallet ou pagamentos.

## Segurança

Este manifesto torna a liberação CARE dependente de evidência objetiva, e não de interpretação, pressa operacional ou confiança implícita.
