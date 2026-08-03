# Registro: Corrida a1de78b2 — Teste Conhecido

## Contexto confirmado

- O passageiro (Jorge) se cadastrou para conhecer o sistema
- A corrida foi solicitada na região de Maricá/Região Serrana
- O aplicativo do motorista foi aberto fora da área de atuação
- A oferta não apareceu para nenhum motorista
- Nenhum motorista realizou a corrida
- Não houve pagamento, taxa da plataforma ou ganho de motorista

## Classificação

REGISTRO_DE_TESTE_CONHECIDO_SEM_IMPACTO_NOS_TOTAIS_LIQUIDADOS

## Comportamento na Área do Contador

- O registro aparece na listagem operacional (corrida existiu)
- Status financeiro: "Dados incompletos" (indicação visual clara)
- Valores financeiros: traços (—) — nenhum valor inventado
- **Não entra nos totais** do resumo (somas usam apenas settlements com `settled_at IS NOT NULL`)
- Não representa prejuízo, erro contábil ou fraude

## Decisão

- Nenhuma correção de status ou valores necessária
- Nenhuma auditoria adicional no banco requerida
- Registro mantido como está — evidência histórica de uso do sistema
