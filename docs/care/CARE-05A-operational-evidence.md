# CARE-05A — fontes oficiais existentes e evidências que ainda faltam

**Escopo:** inventário e função de leitura sem qualquer autorização operacional; não é um novo regulatório, cadastro de seguros, tabelas ou dispatcher. Nenhum campo do cliente pode satisfazer os gates externos de CARE-03/04C.

## Fontes reaproveitadas

- `rides_v2` e `drivers`: identidade da corrida e vínculo territorial dos motoristas.
- `neighborhoods` + `operational_territories`: mesmo bairro/comunidade, área e cobertura territorial ativas, bairro verificado e revisão administrativa concluída.
- `municipal-regulation.service.ts`: fluxo oficial de regularização. Atualmente a enumeração de modalidades cobre `CAR`, `MOTO_PASSENGER`, `MOTO_DELIVERY`, `TAXI` e `VAN`; não há autorização distinta para os modos CARE.
- `operational_insurance_coverages` e `driver_insurance_enrollments`: cadastros oficiais de APP/seguro de carro e vínculo por placa, **sem campo estruturado que prove escopo CARE assistido/cadeira de rodas/adaptação**. Cobertura APP genérica ou registro `ACTIVE` não comprovam endosso específico.

**Decisão segura:** o novo `care-operational-evidence.ts` determina somente se o território existente satisfaz pré-requisitos estritos; `municipalAuthorized=false` e `insuranceConfirmedForMode=false` continuam incondicionais. Isso não afirma que determinada municipalidade exige licença CARE separada ou que um contrato APP jamais pode cobrir CARE; afirma somente que a KAVIAR ainda **não tem evidência específica verificada e modelada** para autorizar automaticamente essa operação.

Não usar um retorno `allowed=true` do gate de modalidade `CAR` como comprovação CARE: o serviço municipal existente pode considerar permitida a operação CAR onde não há regra cadastrada. Não interpretar um campo livre `notes`, `coverage_description`, resposta do fornecedor ou flag enviada pelo aplicativo como prova automática de cobertura.

## Protocolo de falha segura

A função consulta as mesmas tabelas oficiais com cliente Prisma fornecido. Exige:
- identidade CARE; bairro de origem e bairro de cadastro do motorista preenchidos;
- mesmo bairro ou mesma comunidade, sem usar o fallback `OUTSIDE`;
- bairro de origem e do motorista ativos, verificados e com data/administrador de verificação;
- território idêntico, ativo, `coverage_status=COMPLETE` e revisão administrativa válida (não futura);
- qualquer erro da leitura, incerteza ou dado faltante resulta em `false`, sem fallback `CAR_NORMAL` ou mensagem externa.

O retorno `territoryEligible=true` é **apenas** uma condição necessária para a avaliação completa, não autorização de oferta. O retorno global de elegibilidade continua falso enquanto as fontes de seguro e regulação específicas não estiverem integradas.

## Liberação futura — exige decisão específica

1. Validar documentalmente a extensão de cada seguro para o modo e veículo exatos, placa, período, território e passageiros/acompanhantes; obter parecer do fornecedor e revisão competente. Não habilitar automaticamente por `APP` genérico.
2. Registrar a posição municipal oficial por modalidade no sistema regulatório existente e avaliar necessidade de licença/endosso antes de autorizar. Não abrir modelo ou tabela paralela.
3. Revisar se o retorno para casa e fallback territorial possuem condições de segurança específicas CARE e consentimento adequados; até lá permanecem bloqueados.
4. Conectar os gates de fontes confiáveis ao adaptador CARE-04C dentro das transações oficiais existentes, com revalidação antes de oferta e aceite, cobrindo concorrência e ajuste de preço.
5. Validar preço CARE pela fonte oficial de cotação/settlement existente; nenhum preço inferido do carro comum.
6. Homologar regressão das corridas convencionais e testes completos do CARE; aprovar separadamente qualquer mudança do bloqueio CARE-04A.

**Operações realizadas nesta PR:** somente código de leitura, testes unitários sintéticos, documentação e CI. Nenhuma alteração em `dispatcher.service.ts`, `offer-acceptance.service.ts`, `rides-v2.ts`, schema, migrations, rotas, ECS, RDS, pagamentos ou seguro.
