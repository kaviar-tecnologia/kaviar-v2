# Registros observados na Área do Contador

## Corrida 7c4b1985

- Passageiro: Jorge
- Status operacional: Sem motorista
- Status financeiro: Não liquidado
- Contexto confirmado: teste realizado na região de Maricá/Região Serrana, fora da área de atuação. A oferta não apareceu para o motorista. Nenhum motorista realizou a corrida. Não houve pagamento.
- Classificação: REGISTRO_DE_TESTE_CONHECIDO_SEM_IMPACTO_NOS_TOTAIS_LIQUIDADOS

## Corrida a1de78b2

- Passageiro exibido: menina
- Status operacional: Concluída
- Motorista: ausente
- Status financeiro: Dados incompletos (exibição visual da tela)
- Valores financeiros: ausentes (—)

### Fatos observados

- A corrida aparece como concluída sem motorista vinculado
- Não possui settlement liquidado
- Não entra nos totais financeiros apresentados ao contador

### Origem

- A origem exata desta corrida não foi confirmada
- Não deve ser associada ao relato do passageiro Jorge sem nova evidência
- Não há indicação de fraude, prejuízo ou erro contábil

### Impacto na Área do Contador

- Nenhum: o resumo soma apenas settlements com `settled_at IS NOT NULL`
- A tela exibe "Dados incompletos" como indicação visual clara
- Nenhuma ação corretiva necessária neste momento
