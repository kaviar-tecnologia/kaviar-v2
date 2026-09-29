# CARE-05C — auditoria das fontes oficiais de regulação e seguro

## O que existe — e o que NÃO comprova

A função `auditCareGenericScopeRecords` lê, **sem escrever**, as tabelas
oficiais já existentes: `rides_v2`, `care_trip_requirements`,
`drivers`, `neighborhoods`, `municipal_regulations`,
`municipal_authorizations`, `operational_insurance_coverages` e
`driver_insurance_enrollments`.

Ela identifica a presença de registros **genéricos** de CAR e APP,
para apoiar futura revisão documental. Nenhum registro genérico
autoriza o modo CARE, mesmo que a prefeitura aprove o motorista em CAR,
a apólice APP esteja ACTIVE e haja seguro vinculado à placa.
O retorno `municipalAuthorized=false` e
`insuranceConfirmedForMode=false` é literal e incondicional.

A regra municipal comum pode tratar ausência de cadastro regulatório
como permissão para CAR. Isto não é prova afirmativa para assistência,
embarque com cadeira de rodas ou veículo adaptado. Não inferir escopo
pelos campos `notes`, `coverage_description`, URL documental ou JSON
do provedor.

## Prova exigida para cada autorização CARE (ainda não modelada)

É necessária representação estruturada **na fonte oficial**, após
revisão jurídica/seguradora, para associar: modalidade CARE exata,
município/UF, território e local de embarque, veículo/placa,
identificação do ato ou documento oficial, emissor, vigência,
revisão por administrador com data e estado atual/revogação.

Para seguro, conferir apólice e endosso, cobertura específica da
atividade, restrições do modo (inclusive adaptação, acompanhamento e
ocupantes), identificação do veículo, período e território.
`operational_insurance_coverages` não possui hoje campo estruturado
que defina os modos CARE cobertos; `municipal_regulations` enumera
`CAR`, motos, táxi e van, não modalidades CARE. Não emitir
autorização verdadeira até resolver essa lacuna por evolução **aditiva
das estruturas oficiais**, com migração e deploy aprovados em separado.

## Limites

Nenhuma rota nova, cadastro paralelo, API de seguro, dispatcher,
aceite, pagamento, mudança de status de autorizações existentes ou
consulta ao provedor. Os indicadores de registros existentes são
apenas pistas para revisão documental; não enviá-los ao aplicativo
como promessa de disponibilidade. O bloqueio CARE-04A permanece.

A futura integração só poderá passar `true` a CARE-04C a partir de
prova oficial confiável, atual e idêntica ao modo, ao veículo e ao
contexto da corrida. Não aceitar boolean enviado pelo cliente.
