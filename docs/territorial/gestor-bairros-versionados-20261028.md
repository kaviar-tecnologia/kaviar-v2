# Escopo financeiro por bairros do Gestor Territorial — 28/10/2026

## Objetivo

Permitir ao SUPER_ADMIN agendar a ampliação ou redução **prospectiva** dos bairros
remunerados de um Gestor Territorial, sem modificar as geofences, os bairros
oficiais ou o `territory_id` do município. Primeira aplicação prevista:
Saquarema/RJ, 46 bairros GeoSaquá, Jorge Regis. **Nenhuma concessão financeira
ou ativação é feita pelo deploy desta funcionalidade.**

## Desenho e garantias

1. `territory_manager_neighborhood_scope_versions` guarda versões imutáveis
   associadas a `territory_manager_assignments.id`: lista de IDs de bairros,
   instante de vigência (UTC), motivo, referência de acordo, autor e data.
2. Sem versão vigente, a liquidação mantém o comportamento legado (todos os
   bairros do `territory_id` da atribuição). Havendo versão, somente corridas
   com `origin_neighborhood_id` nela recebem os 40% da taxa de plataforma,
   **e apenas se todas as travas já existentes forem satisfeitas**.
3. O Wallet V2 escolhe a última versão com vigência anterior ou igual ao
   relógio de reconhecimento do banco, dentro da mesma transação. Corridas já
   reconhecidas não são recalculadas. O Shadow recebe a mesma regra.
4. Só SUPER_ADMIN pode agendar versões; a seleção deve conter apenas bairros
   ativos do município. Agendamento futuro exige motivo, referência verificável
   do aviso ou acordo e confirmação explícita. Redução com menos de 30 dias exige que
   o Super Admin registre a concordância mútua expressa.
5. O agendamento futuro pode ser cancelado com motivo; a versão é preservada
   com metadados de cancelamento. Após entrar em vigor, não pode ser cancelada
   nem editada retroativamente; agende uma nova versão futura.
6. Não move, apaga, desativa ou altera os bairros, as geofences ou os dados de
   cobertura. Os bairros fora do recorte ficam sem participação deste gestor
   (área remunerada reservada à KAVIAR), sem impedir a operação da cidade.

## Interface

`Admin → Territórios → Cidade → Gestão de bairros`: selecionar o gestor com
vínculo financeiro, marcar/desmarcar bairros, informar vigência, motivo e
referência documental; revisar, confirmar e consultar histórico. Um plano
futuro deve ser cancelado antes de se agendar outro para o mesmo vínculo.

**Limite de escopo:** esta primeira versão controla a **participação financeira**
por bairro, não revoga automaticamente o acesso administrativo `full` do
gestor à cidade. Restringir leitura/ações operacionais por bairro requer uma
revisão de RBAC das rotas que hoje filtram apenas por `territory_id`. Não
anunciar como restrição de permissões operacionais antes dessa revisão.

## Sequência obrigatória de deploy

Este PR adiciona migração Prisma. Executar o workflow protegido de deploy
backend com a opção de **aplicar migrações Prisma**, validando seu sucesso
antes de substituir a task ECS. Não executar o deploy frontend antes da API.
O backend passará a ler a nova tabela em cada liquidação Wallet V2; instalar
o backend sem a migração interromperia liquidações. Não usar atalhos manuais.

## Checklist de aceite

- [ ] Prisma gerado, schema válido, backend e frontend compilados.
- [ ] Sem versão: preservado comportamento financeiro anterior.
- [ ] Versão vigente: bairro incluído elegível, excluído 0%, sem recálculo.
- [ ] Redução antes de 30 dias sem acordo: rejeitada.
- [ ] Vigência passada, bairro estranho, duplicata, concorrência: rejeitados.
- [ ] Versão futura cancelada: preservada no histórico e não entra em vigor.
- [ ] Contrato v1.2/documentação e trilha de auditoria revisados antes de
      habilitar a primeira operação real.
