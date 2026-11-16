# Regularização controlada de gestores territoriais

## Limites

Esta ferramenta é uma API administrativa, não uma rotina automática. A prévia
é o comportamento padrão; a execução permanece desativada enquanto
`MANAGER_REGULARIZATION_EXECUTION_ENABLED` não for exatamente `true`. Ambos os
modos exigem uma sessão válida de `SUPER_ADMIN`; a execução revalida o papel e
o estado da conta dentro da transação. Não inclua senhas, tokens, documentos ou
dados bancários em justificativas, relatórios ou chamados.

Ela não altera perfis, documentos, minutas, contratos, submissões, repasses,
atribuições existentes ou códigos existentes. Cria somente atribuições
`pending_approval`, e não ativa o perfil financeiro. Um novo agente de indicação
é ativo para permitir o uso do código, mas não recebe aceite de termos presumido
nem dados financeiros. Código de um agente existente só é preenchido se estiver
nulo e o agente ativo. Caso comercial ou documental exija intervenção adicional,
não execute a seleção até sua revisão.

Os IDs enviados são uma lista explícita de gestores, não uma seleção automática.
É obrigatório revisá-los individualmente e excluir contas de teste; a rejeição
de nomes contendo a palavra `teste` é apenas uma proteção adicional, não um
classificador confiável. Conta inativa, função diferente de gestor, perfil
incompatível ou falta de acesso territorial `full` bloqueiam a seleção. A
criação de agente exige nome, telefone brasileiro normalizável e ausência de
colisão de telefone detectável. Não inventar contato para satisfazer a regra.

## Prévia e execução

`POST /api/admin/manager-regularization`, com autenticação administrativa e JSON:

```json
{
  "managers": [
    { "adminId": "ID_GESTOR_APROVADO", "assignment": true, "referral": false }
  ]
}
```

Omitir `mode` equivale a `"preview"`. Cada booleano autoriza apenas a ação
correspondente; ambos falsos e IDs repetidos são inválidos. A resposta contém os
IDs de conta, perfil e território, ações propostas, situações contratuais e
documentais, código existente, bloqueios e `fingerprint`. Ela não expõe telefone,
documento, endereço ou dados financeiros. Bloqueios de qualquer gestor impedem
toda a execução. Dados contratuais presentes e status documental não constituem
aprovação documental ou direito a repasse.

Revise o relatório, a origem dos IDs e a seleção. Com autorização operacional
separada, a flag ligada temporariamente e a migração aplicada, execute exatamente
a seleção examinada:

```json
{
  "mode": "execute",
  "managers": [
    { "adminId": "ID_GESTOR_APROVADO", "assignment": true, "referral": false }
  ],
  "fingerprint": "HASH_DA_PREVIA",
  "reason": "Regularização contratual autorizada"
}
```

O hash inclui seleção e dados consultados; alterações detectadas ou expiração de
uma atribuição que mude o resultado obrigam nova prévia. A execução trava as
tabelas relacionadas, reconfere os dados e as restrições de unicidade e persiste
as alterações e a auditoria na mesma transação. A resposta retorna `runId` e
relatórios `before` e `after`; ambos também constam na auditoria da execução.
Cada criação possui uma entrada própria. Se a auditoria falhar, toda a transação
é revertida. Armazene o relatório operacional em local restrito e não o inclua
em repositório público.

Repetir a execução com uma prévia antiga retorna conflito. Uma nova prévia após
execução mostra os registros existentes como preservados; executar novamente
não cria outras atribuições ou códigos. Em falha ou timeout, consulte a auditoria
e gere nova prévia antes de decidir o próximo passo; não suponha que uma resposta
perdida signifique rollback.

## Concorrência e migração

A migração `20261116193000_manager_regularization_uniqueness` acrescenta apenas:

1. Índice único parcial por `(admin_id, territory_id)` para `pending_approval`.
   Gestores diferentes podem continuar candidatos ao mesmo território; as regras
   de exclusividade `active` e elegibilidade financeira não são modificadas.
2. Índice único parcial para o vínculo `referral_agents.email` prefixado
   `operator:`. A unicidade existente de código e telefone permanece.

A migração falha se já houver duplicatas; ela não as reconcilia nem as exclui.
Antes de qualquer autorização de migração, verificar em **somente leitura**, por
exemplo:

```sql
SELECT admin_id, territory_id, count(*)
FROM territory_manager_assignments
WHERE status = 'pending_approval'
GROUP BY admin_id, territory_id HAVING count(*) > 1;

SELECT email, count(*)
FROM referral_agents
WHERE email LIKE 'operator:%'
GROUP BY email HAVING count(*) > 1;
```

Revisar cada conflito e todos os caminhos de escrita antes da janela; não
desduplicar automaticamente. As travas `SHARE ROW EXCLUSIVE` abrangem as cinco
tabelas de conta, perfil, acesso, atribuição e indicação, bloqueiam gravações
concorrentes enquanto a execução está em curso e podem causar espera/deadlock.
Usar lotes pequenos, janela monitorada e timeout; não habilitar por rotina.
Os índices protegem duplicação de atribuição pendente e vínculo de agente mesmo
quando outro escritor não utiliza a ferramenta.

O banco atual garante telefone literalmente único, não equivalência global de
formatação entre todos os agentes. A ferramenta consulta equivalência normalizada
sob trava, mas um escritor legado pode mais tarde inserir outro formato do mesmo
telefone para um vínculo diferente. **Não há garantia global contra essa
duplicidade sem uma regra adicional aplicável a todos os escritores.** Não
alterar essa política comercial por esta migração; eventuais colisões posteriores
exigem revisão separada.

## Implantação e rollback — requerem autorização

1. Comparar novamente backend e frontend implantados com o commit aprovado e
   esta entrega. Revisar CI, contas fictícias, permissões e testes; confirmar que
   a restrição de acesso ao Chat KAVIAR para `SUPER_ADMIN` e `FINANCE` foi
   aprovada. A página executiva perde o resumo e perguntas rápidas que usam o
   mesmo endpoint.
2. Verificar os dois tipos de duplicata, tamanho das tabelas, permissões,
   duração/impacto de criação dos índices e estratégia de locks em homologação
   com cópia estrutural sem dados reais. A migração PostgreSQL cria índices não
   concorrentes e pode bloquear escrita; a janela deve ser avaliada antes de
   qualquer implantação. Nunca aplicar a migração em produção como parte de um
   teste sem autorização específica.
3. Após revisão, autorização de push/merge/deploy **e autorização específica
   para migração**, registrar versões de imagem, task definition e artefatos,
   configurar a flag como desativada e seguir os workflows manuais, que exigem o
   SHA atual de `main`. O workflow de backend detecta alterações em Prisma e,
   mediante a confirmação `APPLY_PRISMA_MIGRATIONS`, executa as migrações
   **antes** do deploy de backend. Ele não deve ser disparado com essa confirmação
   sem autorização específica para todos os efeitos da migração. Verificar todas
   as migrações pendentes, não apenas esta. Validar saúde, autorização, sessão e
   funcionalidade em ambiente apropriado; não chamar GET de perfil de gestor real
   para diagnóstico, pois pode criar perfil.
4. Conceder autorização distinta para eventual ativação temporária da flag e
   execução dos IDs revisados. Repetir prévias imediatamente antes de cada lote.
   Após a janela, desligar a flag e verificar novamente.
5. Em regressão, desligar a flag e restaurar backend e frontend anteriores a
   partir de task definition e artefatos registrados, verificando saúde e
   compatibilidade de sessão. Os workflows fazem rollback em determinadas falhas
   durante a implantação; validar separadamente o procedimento após o sucesso.
   Não remover índices automaticamente: isso retira proteção concorrente e deve
   ser decisão separada após interrupção dos escritores. Não apagar nem reverter
   contratos, indicações, atribuições ou dados financeiros como rollback de código.

Nenhuma dessas etapas autoriza alterações em produção, publicação de contrato,
ativação financeira, push, merge ou deploy.
