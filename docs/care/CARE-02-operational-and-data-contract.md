# CARE-02 — Contrato operacional e dados mínimos de mobilidade

**Estado:** proposta em revisão; não implementa atendimento nem autoriza publicação de uma nova modalidade.
**Base:** CARE-01, PR #415. **Nenhum dado real, cobrança, veículo, habilitação ou cobertura é presumido.**

## Objetivo e limites

Introduzir um modelo **aditivo** para registrar necessidades funcionais de **cada corrida**, aptidão de motorista e recursos verificados do veículo. Não alterar o sistema financeiro, tabelas legadas de idosos, fluxos padrão de `rides_v2` ou as regras territoriais.

CARE não é serviço médico, de remoção, emergência nem promessa de cuidador. Atendimento por familiar autorizado e acompanhamento pessoal serão objetos de contratos e autorização específicos, futuros.

A condição clínica/idade não deve ser usada como barreira para solicitar corrida convencional. Os campos descrevem recursos necessários, sem diagnóstico, laudo, CID, medicação, endereço clínico ou texto livre de saúde. Cão-guia serve apenas para preparar o atendimento, **não** como justificativa para exclusão do matching.

## Três modos de transporte

| Código | O que representa | Condição obrigatória futura |
| --- | --- | --- |
| `ASSISTED` | Transporte em banco convencional com tempo e orientação de embarque | Motorista treinado para o procedimento; sem transferência física não habilitada. |
| `FOLDING_WHEELCHAIR` | Cadeira dobrável acomodada no veículo; ocupante sentado no banco | Passageiro declara transferência autônoma; espaço conferido e treinamento. Se não puder se transferir, não ofertar este modo. |
| `ADAPTED_WHEELCHAIR` | Passageiro permanece sentado na cadeira em veículo adaptado | Documentos e inspeção, capacidade, rampa/plataforma e fixação do equipamento e ocupante verificados. Sem improvisação. |

Modo é requisito para a viagem, não classificação pessoal permanente. Não inferir capacidade de transferência apenas pela presença de uma cadeira dobrável.

## Modelo aditivo (somente schema nesta etapa)

- `care_trip_requirements`: um registro por `rides_v2`, com modo, recursos objetivos, quantidade de acompanhantes, declaração de transferência e estado inicial `DRAFT`. Relação com corrida, sem perfil médico.
- `care_driver_qualifications`: um registro por motorista; treinamento por modalidade, status inicial `PENDING`, validade e ator verificador. Falta de registro, documentação vencida ou status diferente de `VERIFIED` devem resultar em **não elegível**.
- `care_vehicle_capabilities`: um registro por motorista/veículo cadastrado, com placa capturada na verificação, recursos, capacidade, validade e auditor de verificação. Troca de placa invalida a compatibilidade; exigir verificação novamente.
- Nenhuma tabela de preferências permanentes nesta etapa. Um consentimento específico e revogável deve ser desenhado antes de persistir preferências além da corrida.
- Nada cria contratos `elderly_contracts`; `medical_notes` legado permanece intacto e requer revisão separada de acesso e retenção.

## Regras de domínio a implementar em CARE-03/04

1. API deve receber somente modos reconhecidos; nunca aceitar o `service_category` enviado pelo cliente como prova de elegibilidade.
2. Para `FOLDING_WHEELCHAIR`, exigir declaração de transferência autônoma e espaço verificado. Ausência de informação = indisponível para esta modalidade.
3. Para `ADAPTED_WHEELCHAIR`, exigir permanência na cadeira, capacidade real, documento de adaptação e equipamentos de acesso/retenção verificados com validade vigente.
4. Motorista e veículo exigem status `VERIFIED`, documentação atual, autorização operacional pertinente e treinamento aplicável; revalidar durante oferta, aceite e redistribuição.
5. A filtragem de segurança é anterior à distância e ao score. Regras municipais, territoriais e do passageiro não podem ser contornadas.
6. Agendamento atual despacha perto da hora; não comunicar “veículo confirmado” antes do aceite real.
7. Falha da verificação = **fail-closed** para a modalidade específica, com mensagem clara e opção de suporte. Não bloquear a possibilidade de corrida convencional compatível.
8. Não registrar notas clínicas, não compartilhar mais informação com motorista do que o estritamente necessário, nem preencher terceiros automaticamente via WhatsApp.
9. Preço e remuneração CARE dependem de política própria revisada; nenhum adicional por condição pessoal ou tarifa fictícia é criado por esta alteração.
10. Não publicar novas rotas ou chaves `service_category` até que o fluxo real, os controles de segurança, seguros e validação operacional estejam concluídos.

## Transições de revisão dos cadastros

`PENDING -> VERIFIED / REJECTED`, `VERIFIED -> SUSPENDED / EXPIRED`, `SUSPENDED -> PENDING` mediante nova análise. Esta etapa só modela o estado; não implementa endpoints, autorizadores ou jobs. Nenhum `VERIFIED` é inserido por migração, seed ou default.

O estado `DRAFT` da necessidade por corrida não significa corrida aprovada. A futura API deve validar os campos antes de alterar para `READY`; `BLOCKED` exige tratamento humano ou correção.

## Requisitos de privacidade antes do rollout

Definir finalidade, fundamento legal, aviso aos titulares, política de retenção, exclusão/revisão, acesso com privilégio mínimo, trilha de auditoria, gestão da autorização de familiares e avaliação de impacto quando aplicável. A revisão jurídica, de seguros e regulatória é uma porta de lançamento, não algo automaticamente resolvido pelo schema.

## Migração e implantação

Esta proposta **não** aplica migration. O SQL cria somente enums/tabelas/índices/FKs/constraints novos, todos inicialmente vazios, e acrescenta apenas campos relacionais no Prisma. Não altera `rides_v2`, `drivers`, registros existentes, `medical_notes`, pagamentos, créditos ou precificação.

Antes de executar migrations em produção: revisar drift, backup e reversibilidade; aplicar em ambiente descartável, comparar schema, obter aprovação específica para deploy. Migrations existentes não devem ser executadas em produção como efeito colateral deste PR.

## Critérios de aceite

- `prisma validate` e geração de cliente passam.
- SQL cria apenas os três modelos e dois enums; não faz INSERT, UPDATE, DELETE nem alteração de tabela financeira.
- Invariantes SQL previnem confirmação sem verificação, adaptação marcada sem itens essenciais e cadeira dobrável sem declaração de transferência.
- Sem seed ou flag de habilitação; o mobile CARE segue “Em implantação.”
- Nenhum deploy/migração ativado pelo PR.

## Próximo PR

CARE-03: validação de capacidade, treinamento, placa, município e cobertura do veículo com regras de matching e testes. **Não habilitar CARE** enquanto esses gates não estiverem implementados e homologados.
