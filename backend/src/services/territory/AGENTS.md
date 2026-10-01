# AGENTS — serviços territoriais

Este arquivo orienta agentes/IA que alterem código em `backend/src/services/territory/**`.

Antes de mudar aquisição, providers, preparação de cidade ou geofences, leia:

- `docs/territory/TERRITORIAL_DATASET_SOURCES.md`
- `docs/territory/TERRITORIAL_ACQUISITION_RUNBOOK.md`

## Regras obrigatórias

1. **Fonte oficial conhecida tem precedência sobre OSM.**
2. **OSM é fallback comunitário, não prova de divisão oficial municipal.**
3. Se uma fonte oficial estiver configurada e falhar, **falhe fechado**. Não faça downgrade silencioso para OSM.
4. Reutilize providers por protocolo/formato. Não crie provider específico por cidade quando configuração resolver.
5. Para ArcGIS, adicionar cidade normalmente significa alterar `providers/official-territorial-sources.ts`, não duplicar `OfficialArcGisProvider`.
6. `is_official=true` **não** implica `source_verified=true`.
7. `source_verified` deve permanecer falso até revisão humana/administrativa apropriada.
8. Aquisição e PREVIEW **não** autorizam APPLY.
9. Não execute APPLY, não altere neighborhoods/geofences e não ative cidade sem autorização explícita para essa etapa.
10. Não faça snap, fechamento ou reparo geométrico artificial sem fonte autoritativa que justifique a alteração.
11. Não misture bairro, vila, comunidade, distrito, setor censitário ou região administrativa como se fossem a mesma entidade.
12. Preserve proveniência: provider, órgão, URL, método, IDs/códigos e data de coleta.
13. Mudança territorial deve manter testes do provider, roteamento e regressões OSM verdes.
14. Não reduza validações para “fazer passar” um dataset suspeito.
15. Evite refatoração ampla/Frankenstein durante correção de uma cidade. Faça a menor mudança reutilizável que preserve a arquitetura.

## Ao surgir um município novo com problema

Siga esta ordem:

```text
1. confirmar município/UF e tipo de divisão
2. checar catálogo de fontes oficiais
3. procurar fonte oficial da prefeitura/órgão competente
4. testar a fonte em modo somente leitura
5. validar nomes, geometrias, duplicidades e cobertura
6. reutilizar/adicionar provider genérico
7. adicionar configuração por cidade/UF
8. rodar testes territoriais + build
9. gerar somente DRAFT/PREVIEW quando autorizado
10. revisar antes de qualquer APPLY
```

## Caso de referência

Diadema/SP é o caso de referência desta arquitetura.

O OSM retornava dados plausíveis, mas misturava tipos territoriais e continha geometrias problemáticas. A fonte oficial GeoDiadema/SEPLAGE forneceu 11 bairros oficiais válidos. A solução correta foi criar um provider ArcGIS reutilizável + catálogo por cidade, e não “consertar” o OSM manualmente.

Se uma mudança futura contrariar esse padrão, registre explicitamente o motivo técnico e a evidência antes de implementá-la.
