# Proposta de regularização do portal dos gestores

Esta proposta não autoriza operações em produção, não ativa participações financeiras
e não substitui revisão documental ou contratual pela central e pelo proprietário.

## Sessões e diagnóstico

- A emissão dos tokens administrativos e sua verificação devem usar a mesma
  precedência de segredo. A divergência de precedência é um defeito potencial,
  mas não prova a causa de erros 401.
- As respostas 401 devem levar ao novo login, sem descrever o erro como perfil ou
  território ausente. As razões registradas no servidor não incluem tokens ou dados
  documentais. Uma indisponibilidade da consulta de escopo continua bloqueando o
  acesso e é informada como erro, não como falta de vínculo.
- Correlacionar futuras ocorrências por identificador de requisição e horário,
  sem registrar token, CPF ou chave financeira. Não pedir que gestores compartilhem
  credenciais.

## Indicações

1. Antes de qualquer alteração, produzir uma relação somente leitura por ID da conta:
   agente vinculado pelo identificador administrativo, código existente, estado do
   agente e contagem de indicações, inclusive para contas inativas.
2. Preservar todos os agentes, códigos, indicações e histórico. Não fundir contas
   pelo nome e não substituir um código existente, mesmo que inativo. Rever
   separadamente agentes duplicados, inativos ou sem código.
3. Após revisão e autorização expressa, criar código apenas para conta elegível sem
   agente ou código, usando o mecanismo existente, unicidade e auditoria. Antes da
   execução, confirmar seu comportamento concorrente e o escopo do território.
4. Reconsultar cada gestor no momento da execução, pois os dados podem ter mudado.

## Documentos e contratos

- Permitir acesso aos dados próprios do perfil, da minuta e do cadastro documental
  independentemente de o perfil ou a participação financeira estarem ativos.
- A geração v1.2 existente exige exatamente uma atribuição territorial compatível
  em `pending_approval`, `active` ou `suspended`. Ausência ou ambiguidade deve
  ser revisada pela central; não criar automaticamente uma atribuição ativa.
- O cadastro documental e a geração, disponibilização ou assinatura da minuta não
  constituem ativação financeira. Atribuições `pending_approval` não são repasses.
- Preservar os contratos anteriores, submissões, versões, arquivos e evidências.
  Reconciliar a localização e os estados
  documentais individualmente; não inferir novo aceite nem reclassificar como v1.2.
  Uma nova minuta para um perfil com registro contratual anterior exige procedimento
  de revisão/aditivo expressamente autorizado.
- Se o cadastro mudar durante a geração ou envio, a operação responde com conflito
  e não altera o estado contratual. O arquivo já escrito no armazenamento privado
  pode ficar sem referência; sua identificação e eventual limpeza exigem uma rotina
  separada, revisada e autorizada, sem apagar documentos históricos.
- Não desabilitar os controles de autenticação, escopo territorial, revisão
  documental ou elegibilidade financeira. Antes de qualquer execução posterior,
  revisar os resultados com o proprietário e obter autorização específica.

## Validação desta implementação

Os testes usam contas e dados fictícios. O fluxo também foi executado em PostgreSQL
local descartável, com armazenamento simulado. O PDF v1.2 é gerado pelo código real,
mas nenhum documento real é assinado, enviado ou consultado. A execução não comprova
integração real com S3, e-mail ou WhatsApp.

O teste PostgreSQL é opt-in (`RUN_MANAGER_PORTAL_PG_INTEGRATION=1`) e recusa outros
servidores: exige banco `manager_portal_test` em `127.0.0.1:65432`, com diretório
de dados terminado em `/files/manager-portal-test-pg`. O banco precisa ser criado
como instância descartável, com PostGIS e o esquema Prisma correspondente. O teste
utiliza identificadores fictícios únicos; não aponte para banco compartilhado.
