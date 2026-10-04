# CARE-482 — Dispatcher filters gated

## Estado

Este controle registra que o dispatcher CARE ainda permanece fechado por padrão.

O dispatcher público não pode enviar corrida CARE para motorista enquanto a liberação oficial não estiver pronta.

## Garantias

- CARE é bloqueado antes da descoberta de candidatos.
- Ofertas pendentes CARE importadas ou sintéticas são canceladas.
- Corridas CARE importadas ou sintéticas viram no_driver.
- Nenhuma oferta CARE é criada pelo dispatcher público.
- Nenhum evento realtime CARE é enviado ao motorista.
- O filtro care_ineligible em findCandidates permanece apenas preparatório.
- A transação de oferta continua recusando CARE com CARE_SERVICE_NOT_AVAILABLE.

## Fora de escopo

Este passo não habilita CARE oficial, não muda pricing, não muda aceite, não muda wallet, não cria migration e não faz deploy.
