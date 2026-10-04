# CARE-485 — Controlled pilot activation plan

## Estado

Este plano descreve a ativação futura e controlada do piloto CARE.

Este passo não ativa CARE oficial, não muda flags, não muda backend operacional e não faz deploy.

## Princípios obrigatórios

- Piloto interno primeiro, sem exposição pública ampla.
- CARE não pode ser liberado apenas por flag.
- CARE não pode usar dados médicos, diagnóstico, CID ou justificativa clínica.
- Passageiro idoso, PCD ou com mobilidade reduzida não pode pagar mais caro por sua condição.
- O preço inicial do piloto deve preservar paridade com a corrida comum equivalente, salvo revisão jurídica e regulatória futura.
- Motorista precisa ter qualificação CARE verificada.
- Veículo precisa ter capacidade CARE verificada.
- Município, território e seguro precisam estar verificados antes da oferta.
- A oferta precisa revalidar elegibilidade no dispatcher.
- O aceite precisa revalidar elegibilidade antes de assignment, wallet, pricing e notificações.

## Ordem segura para ativação futura

1. Criar modo piloto interno sem aparecer para todos os passageiros.
2. Manter preço de corrida comum equivalente no primeiro piloto.
3. Permitir apenas CARE_ASSISTED simples e FOLDING_WHEELCHAIR quando houver motorista e veículo compatíveis.
4. Manter CARE_ADAPTED_WHEELCHAIR fora do piloto até existir veículo realmente adaptado e evidência documental.
5. Exigir evidência municipal, territorial e securitária verificada.
6. Revalidar motorista, veículo, território, cidade, seguro e preço no dispatcher.
7. Revalidar tudo novamente no aceite.
8. Executar testes de regressão de CAR_NORMAL, MOTO_PASSENGER, Premium, wallet, pricing e ajuste.
9. Exigir autorização expressa antes de merge de qualquer ativação.
10. Exigir autorização expressa separada antes de deploy.

## Fora de escopo

Este PR não habilita CARE oficial, não muda app, não muda backend operacional, não muda dispatcher, não muda aceite, não muda pricing, não muda wallet, não cria migration, não altera variáveis de produção e não faz deploy.
