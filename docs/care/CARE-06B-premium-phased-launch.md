# CARE — preparação premium por modalidade (CARE-06B, etapa 1)

**Decisão de produto (29/09/2026):** preparar um atendimento de alto padrão sem
criar sobretaxa Premium CARE e sem condicionar todas as modalidades à existência
de vans. Esta é uma preparação técnica/documental, **não é liberação de corridas**.

## Disponibilidade independente e verdadeira

- **ASSISTED:** automóvel convencional pode ser candidato quando atendimento
  solicitado, treinamento, inspeção, capacidade, território, norma e seguro da
  operação efetiva estiverem verificados.
- **FOLDING_WHEELCHAIR:** exige transferência autônoma e segura nos termos do
  contrato CARE-03, treinamento específico, armazenamento da cadeira, vagas e
  os mesmos gates externos. Nunca converter automaticamente o pedido de quem
  precisa permanecer sentado na cadeira para esta modalidade.
- **ADAPTED_WHEELCHAIR:** requer veículo efetivamente adaptado, rampa/elevador,
  ancoragem, retenção do ocupante e documentação. Sem esses itens, modalidade
  indisponível no território, **não bloqueia ASSISTED nem FOLDING_WHEELCHAIR**.
  Não apresentar veículo comum ou van excluída da apólice como coberto/adaptado.

A categoria CARE correta não pode cair silenciosamente em CAR_NORMAL por
falta de frota. Nenhum passageiro deve receber confirmação de um atendimento
que o veículo/motorista não consegue prestar. Ausência de oferta habilitada
produz indisponibilidade honesta da modalidade solicitada.

## Padrão de atendimento

Cadastro claro das necessidades estritamente operacionais sem CID/diagnóstico;
suporte acessível; informação antecipada sobre possibilidade de acompanhante,
cão-guia e equipamento; motorista com treinamento/documentação conferidos;
placa e veículo exatos; confirmação de capacidade antes de ofertar; previsibilidade
de chegada e embarque; canal de ajuda; trilha de aceite, cancelamento e incidente.
Não anunciar disponibilidade territorial sem verificar pessoas/veículos reais.

**Premium é experiência, não tarifa diferenciada.** Uma viagem CARE comparável
ao carro convencional usa o mesmo preço em centavos, mesmas condições objetivas
e perfil oficial `CAR_NORMAL`; não cobrar idade, deficiência, condição pessoal,
embarque assistido, cadeira, cão-guia ou acompanhante necessário. Preservar a
divisão financeira vigente (18% plataforma, 82% motorista) sem adicionar um
financeiro, wallet, ledger ou dispatcher paralelo.

## Seguro e ativação

O APP contratado com a Previlemos continua como base comercial. Cobertura CARE
específica **não se presume**: confirmar por escrito modalidade, automóvel,
motorista/placa, assistência, riscos e exclusões com seguradora/corretora.
Se necessário no futuro, negociar endosso ou produto adequado sem obrigar
nova contratação agora. Não preencher `care_scope_verified`, vínculo de
apólice, certificado ou origem documental sem evidência real; nenhum seed
simula seguro.

A validação de uma modalidade não exige frota/seguro de outra. A ausência de
cobertura apropriada para ADAPTED bloqueia essa modalidade apenas; a ausência
de confirmação para ASSISTED ou FOLDING bloqueia aquela modalidade até prova.

## CARE-06B: comprovante oficial de preço (etapa atual)

`readCareOfficialFareEvidence` só lê `rides_v2` e
`ride_settlements` do **mesmo** `ride_id`, incluindo perfil
`pricing_profiles` classificado como `CAR_NORMAL/CAR`. Sem valores
fornecidos pelo cliente. Exige quote e lock positivos/iguais em centavos,
cache íntegro, ausência de ajuste de motorista, fechamento final inalterado
e fee snapshot íntegro. Não escreve valores nem cria viagem CAR fictícia.

**Limite:** a inspeção de um settlement existente, isoladamente, não prova
que a fórmula original da cotação CARE usou a rota/tempo objetivos idênticos
ao `CAR_NORMAL`. Ainda faltam integração da cotação/lock ao escritor oficial,
prova de fonte na própria transação, idempotência/concorrência em PostgreSQL
descartável, comparações quote–lock–ajuste–settlement e regressão de CAR/MOTO/
Premium. Esse é o restante de #436. Não marcar #436 concluída por esta etapa.

## Release

CARE-04A permanece incondicional: criação/estimativa, dispatcher, oferta, aceite
e ajuste CARE continuam bloqueados. Nenhuma alteração à `main`, migração
ou deploy de produção; integração e release requerem aprovação separada.
