# CARE-03 — Motor puro de compatibilidade, sem despacho

**Referência:** PRs #415 (contenção de demonstração) e #416 (modelo aditivo). **Este módulo NÃO está integrado à API, à oferta ou ao dispatcher.** Não autoriza corridas CARE, operação com cadeira, seguro ou acompanhamento.

## Contrato do avaliador

Arquivo `backend/src/services/care/care-eligibility.ts`: função pura `evaluateCareEligibility`, consumindo snapshots tipados de `care_trip_requirements`, `care_driver_qualifications` e `care_vehicle_capabilities`, além da placa atual e de gates operacionais confiáveis.

- Falta de registro, `READY`, revisão ou evidência = inelegível.
- Falta de `VERIFIED`, validade e revisor para motorista ou veículo = inelegível.
- Placa atual diverge da placa verificada, tipo de veículo não é `CAR`, treinamento específico ausente, capacidade insuficiente ou equipamento adaptado não validado = inelegível.
- Autorização municipal, regra territorial, motorista ativo/online e confirmação de seguro na modalidade exigem `true` explicitamente. **Esses booleans precisam ser derivados por serviço confiável do backend e nunca aceitos do aplicativo.**
- Apenas motorista mais próximo **depois** da validação; nunca converter uma necessidade de adaptação em corrida `CAR_NORMAL` automaticamente.
- `guide_dog`, orientação de embarque e tempo adicional não são fundamentos de recusa. Seu atendimento deve ser operacionalmente planejado.
- Retorna códigos técnicos de recusa, **sem dados clínicos**. Mensagens ao passageiro serão definidas em CARE-04, evitando revelar informações sensíveis.

## Condições prévias para conectar ao dispatcher (CARE-04)

1. Modelos e migration CARE-02 implantados **com autorização separada**, backup, verificação de drift e trilha de evidência.
2. Resolver do backend consulta os três modelos e a placa do veículo atual; qualificação deve ser revogada/reavaliada se veículo/placa mudou.
3. Comprovação de seguro para o serviço e veículo deve vir de fonte administrativa validada, não de parâmetro de requisição. Faltando a confirmação, o motor falha fechado.
4. `rides_v2` + `care_trip_requirements` são gravados atomically. Não iniciar dispatcher se necessidade ausente ou `DRAFT/BLOCKED`.
5. Mesmo gate usado no `findCandidates`, antes de cada oferta e no endpoint de aceite; repetir após cancelamento/redispatch, mudança de documentos e vencimentos.
6. As regras municipais, territorialidade e estado de motorista já implementadas devem **compor** o gate, não ser substituídas.
7. Ausência de veículo compatível deve gerar resultado honesto e encaminhamento humano, não oferta enganosa.
8. Validar implicações de reserva de assentos e cadeira com parceiro técnico antes do piloto. Campo de equipamento/inspeção não é certificado real.
9. Não alterar checkout, pricing ou financeiro para CARE neste PR.
10. Cobertura, treinamento, adaptação e autorização dependem de evidência verificável. Não autorizar nenhum registro artificial como se fosse real.

## Verificação

- `backend/tests/care-03-eligibility.test.ts` testa as três modalidades, validades, placas, treinamentos, companheiros, confirmação externa de seguro, município, território, status, guia/cão-guia e falhas.
- CI executa testes unitários e TypeScript backend em ambiente sem dados reais.
- `src/components/passenger/ServiceSelector.tsx` deve continuar “Em implantação.”
- PR inicialmente **Draft**; sem deploy, migrations ou alterações ao runtime operacional.

## Limitação proposital

O avaliador é uma *biblioteca de domínio*. Receber `eligible: true` de um objeto montado em teste não significa que um motorista real está apto. Somente CARE-04 poderá integrar dados confiáveis, transação, oferta, aceite, logs e flags. Atendimento humano/seguradora e operação municipal continuam portas de lançamento.
