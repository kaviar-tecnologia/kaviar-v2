# KAVIAR - Checklist de Submissão Google Play

## Estado técnico Android

### Base Android

- [x] minSdkVersion 29 configurado e confirmado no prebuild/Gradle
- [x] targetSdkVersion 36 configurado e confirmado no prebuild/Gradle
- [x] compileSdkVersion 36 configurado e confirmado no prebuild/Gradle
- [x] android:allowBackup=false
- [x] CropImageActivity android:exported=false
- [x] Firebase Test Lab Passed no Passageiro
- [x] Firebase Test Lab Passed no Motorista
- [x] APKs internos anteriores validados

### KAVIAR Motorista - configuração atual pré-build

- [x] Nome: Kaviar Motorista
- [x] Package: `com.kaviar.driver`
- [x] Versão: `1.12.3`
- [x] versionCode: `8`
- [x] Manifest release mesclado pelo Gradle validado
- [x] `ACCESS_COARSE_LOCATION` presente
- [x] `ACCESS_FINE_LOCATION` presente
- [x] `CAMERA` presente
- [x] `FOREGROUND_SERVICE` presente
- [x] `FOREGROUND_SERVICE_LOCATION` presente
- [x] `LocationTaskService` declarado com `android:foregroundServiceType="location"`
- [x] `ACCESS_BACKGROUND_LOCATION` ausente
- [x] `READ_MEDIA_IMAGES` ausente
- [x] `READ_MEDIA_VIDEO` ausente
- [x] `READ_EXTERNAL_STORAGE` ausente
- [x] `WRITE_EXTERNAL_STORAGE` ausente
- [x] `MANAGE_EXTERNAL_STORAGE` ausente
- [x] `RECORD_AUDIO` ausente
- [x] `SYSTEM_ALERT_WINDOW` ausente
- [x] Permissões legadas de armazenamento bloqueadas apenas no Motorista
- [ ] AAB final Motorista gerado
- [ ] Manifest/permissões confirmados também no AAB final
- [ ] Assinatura do AAB final validada
- [ ] Compatibilidade 16 KB validada no AAB final
- [ ] Teste fechado criado/atualizado no Play Console
- [ ] Pre-launch report analisado

### KAVIAR Passageiro

- [ ] AAB final Passageiro gerado
- [ ] Teste fechado criado/atualizado no Play Console
- [ ] Pre-launch report analisado

## Apps

### KAVIAR Passageiro

Package:

- `com.kaviar.passenger`

Necessário para Play Console:

- [ ] Nome do app
- [ ] Descrição curta
- [ ] Descrição completa
- [ ] Ícone 512x512
- [ ] Feature graphic 1024x500
- [ ] Screenshots
- [ ] Categoria
- [ ] Email de suporte
- [ ] Política de privacidade
- [ ] Link de exclusão de conta
- [ ] Conta de teste de passageiro
- [ ] Data Safety revisado

### KAVIAR Motorista

Package:

- `com.kaviar.driver`

Necessário para Play Console:

- [ ] Nome do app confirmado no Play Console
- [ ] Descrição curta revisada
- [ ] Descrição completa revisada
- [ ] Ícone 512x512 confirmado
- [ ] Feature graphic 1024x500 confirmada
- [ ] Screenshots atualizados
- [ ] Categoria confirmada
- [ ] Email de suporte confirmado
- [ ] URL da política de privacidade confirmada
- [ ] URL de exclusão de conta confirmada
- [ ] Conta de teste de motorista aprovado validada
- [ ] Conta de teste de motorista pendente, se necessária
- [ ] Data Safety revisado contra o comportamento real do app
- [ ] App Content revisado
- [ ] Declaração de uso de serviço em primeiro plano/localização revisada no Play Console
- [ ] Vídeo de demonstração do fluxo de localização preparado, caso exigido no formulário do Play Console
- [ ] Instruções de acesso do revisor preenchidas
- [ ] Confirmar no AAB final que não existe `ACCESS_BACKGROUND_LOCATION`

## Prominent Disclosure - KAVIAR Motorista

### Cadastro

- [x] Disclosure aparece antes da permissão nativa
- [x] Informa coleta de localização precisa
- [x] Explica finalidade: identificar cidade e território de atuação
- [x] Botão afirmativo: **Concordo e continuar**
- [x] Pedido nativo ocorre somente após a ação do usuário

### Regularização municipal

- [x] Disclosure aparece antes da permissão nativa
- [x] Informa coleta de localização precisa
- [x] Explica finalidade: identificar cidade e verificar exigências municipais
- [x] Botão afirmativo: **Concordo e continuar**
- [x] Pedido nativo ocorre somente após a ação do usuário

### Ficar Online

- [x] Disclosure aparece antes da permissão nativa
- [x] Informa coleta e uso da localização precisa
- [x] Explica uso para mapa, corridas próximas, recebimento de corridas e atualização de posição
- [x] Explica continuidade da coleta com aplicativo minimizado
- [x] Explica que o Android exibirá notificação enquanto o recurso estiver ativo
- [x] Explica compartilhamento da localização com o passageiro durante a corrida
- [x] Explica que o motorista pode interromper a coleta ficando offline
- [x] Botão afirmativo: **Concordo e continuar**
- [x] Foreground service iniciado após ação do motorista
- [x] Não solicita `ACCESS_BACKGROUND_LOCATION`

### Corrida em andamento / concluir corrida

- [x] Verifica primeiro se a permissão já existe
- [x] Se não existir, mostra disclosure antes do pedido nativo
- [x] Informa coleta de localização precisa durante a corrida
- [x] Explica uso para mapa, deslocamento e atualização da viagem
- [x] Botão afirmativo: **Concordo e continuar**
- [x] Pedido nativo ocorre somente após a ação do usuário

### Câmera para documentos

- [x] Permissão não é solicitada automaticamente
- [x] Usuário escolhe explicitamente **Tirar Foto**
- [x] Somente depois dessa ação o app solicita permissão de câmera
- [x] Escolha de arquivo usa `DocumentPicker`
- [x] Não há permissões amplas de armazenamento no Manifest final mesclado

## Política de privacidade e identidade institucional

- [x] Fonte React da política identifica `KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA`
- [x] CNPJ atual: `67.783.601/0001-99`
- [x] Política estática `frontend-app/public/privacidade/index.html` atualizada
- [x] Política descreve localização com aplicativo minimizado
- [x] Política descreve compartilhamento de localização com passageiro durante corrida
- [x] Política aponta para exclusão de conta
- [x] Link **Política de Privacidade** implementado no Perfil do Motorista
- [x] Link **Excluir conta e dados** implementado no Perfil do Motorista
- [x] Nenhuma referência a USB Tecnok permanece no `frontend-app`
- [x] Nenhuma referência ao CNPJ antigo permanece no `frontend-app`
- [ ] Alterações desta branch mergeadas na `main`
- [ ] Frontend atualizado publicado
- [ ] URL pública `/privacidade` conferida após publicação
- [ ] Confirmar que a página pública não contém USB Tecnok nem CNPJ antigo após publicação

## Páginas legais públicas

URLs existentes:

- [x] https://kaviar.com.br/privacidade
- [x] https://kaviar.com.br/termos-passageiro
- [x] https://kaviar.com.br/termos-motorista
- [x] https://kaviar.com.br/excluir-conta

Validação após esta atualização:

- [ ] Conferir conteúdo publicado de `/privacidade`
- [ ] Conferir conteúdo publicado de `/termos-motorista`
- [ ] Conferir conteúdo publicado de `/excluir-conta`

## Dados pessoais e Data Safety

Revisar no Play Console de acordo com o comportamento real do app:

- Nome
- CPF
- RG
- CNH
- Endereço
- Telefone
- E-mail
- Localização aproximada
- Localização precisa
- Dados de corrida
- Mensagens internas de corrida
- Fotos/documentos do motorista
- Fotos de perfil ou veículo
- Dados bancários/Pix quando aplicável
- Dados de pagamento/recarga quando aplicável
- Push token/notificações
- Identificadores técnicos do dispositivo quando aplicável

Pendências:

- [ ] Comparar formulário atual de Data Safety do Play Console com esta lista
- [ ] Confirmar coleta versus compartilhamento
- [ ] Confirmar terceiros/processadores declarados
- [ ] Confirmar retenção e exclusão
- [ ] Confirmar SDKs presentes no AAB final

## Permissões sensíveis

### Passageiro

Revisar separadamente:

- Localização
- Câmera, se utilizada
- Notificações
- Permissões efetivas do AAB final

### Motorista

Permissões necessárias e verificadas no Manifest mesclado:

- Localização aproximada
- Localização precisa
- Serviço de localização em primeiro plano
- Câmera
- Notificações

Não presentes:

- `ACCESS_BACKGROUND_LOCATION`
- `READ_MEDIA_IMAGES`
- `READ_MEDIA_VIDEO`
- `READ_EXTERNAL_STORAGE`
- `WRITE_EXTERNAL_STORAGE`
- `MANAGE_EXTERNAL_STORAGE`
- `RECORD_AUDIO`
- `SYSTEM_ALERT_WINDOW`

## Contas de teste para revisão

Criar e validar:

- [ ] `passageiro.review@kaviar.com.br`
- [ ] `motorista.review@kaviar.com.br`

Para o Motorista confirmar:

- [ ] Login funciona
- [ ] Conta está aprovada/ativa
- [ ] Não depende de aprovação manual durante a revisão
- [ ] Não existe bloqueio territorial inesperado
- [ ] Tela **Ficar Online** está acessível
- [ ] Disclosure aparece
- [ ] Permissão nativa aparece somente após **Concordo e continuar**
- [ ] Estado online funciona
- [ ] Notificação persistente de localização aparece

## Instruções para o revisor

Incluir no Play Console:

1. Baixe o app.
2. Faça login com a conta de teste informada.
3. No Motorista, utilize a conta aprovada fornecida.
4. Na tela principal, toque em **Ficar Online**.
5. O aviso **Uso da sua localização** aparece antes da solicitação nativa do Android.
6. Leia o aviso e toque em **Concordo e continuar**.
7. Autorize a localização no diálogo do Android.
8. O motorista ficará online.
9. Enquanto o serviço de localização estiver ativo, o Android exibirá a notificação persistente do KAVIAR Motorista.
10. Durante uma corrida, a localização do motorista é utilizada para acompanhamento operacional e atualização da posição.
11. O app não solicita `ACCESS_BACKGROUND_LOCATION` nem a opção **Permitir o tempo todo**.

## Antes de gerar o AAB Motorista

- [x] Revisar fluxos de permissão
- [x] Revisar Prominent Disclosure
- [x] Inspecionar Manifest release mesclado
- [x] Remover permissões desnecessárias de armazenamento
- [x] Confirmar foreground service de localização
- [x] Confirmar package/version/versionCode
- [x] Corrigir política de privacidade no código
- [x] Implementar acesso à política no app
- [x] Implementar acesso à exclusão de conta no app
- [x] Remover referências institucionais antigas do frontend
- [x] Rodar validações finais de código da branch
- [x] Revisar diff completo da branch
- [ ] Commit/push/PR
- [ ] CI aprovado
- [ ] Merge na main
- [ ] Gerar AAB novo a partir da versão corrigida

## Observação de baseline TypeScript

A validação final desta branch confirmou:

- Frontend Vite: build de produção concluído com sucesso.
- ESLint dos arquivos mobile alterados: 0 erros.
- `git diff --check`: sem erros.
- Nenhuma referência a USB Tecnok ou ao CNPJ antigo permanece no `frontend-app`.
- O typecheck global do mobile ainda apresenta 33 erros em 13 arquivos já existentes no baseline.
- Os erros reportados em `complete-ride.tsx`, `municipal-regularization.tsx` e `online.tsx` estão em linhas não alteradas por esta branch.
- Esses erros de baseline devem ser tratados separadamente e não fazem parte da correção de conformidade Google Play desta versão.

## Antes de enviar para revisão no Google Play

- [ ] AAB final analisado
- [ ] AAB final sem `ACCESS_BACKGROUND_LOCATION`
- [ ] AAB final sem permissões amplas de mídia/armazenamento
- [ ] AAB final com foreground service `location`
- [ ] Conta de revisor Motorista validada
- [ ] Data Safety revisado
- [ ] App Content revisado
- [ ] Declaração de foreground service/localização preenchida
- [ ] Vídeo de demonstração preparado/enviado quando requerido pelo formulário
- [ ] Política pública atualizada e conferida
- [ ] Exclusão de conta pública conferida
- [ ] Teste fechado executado
- [ ] Pre-launch report analisado
- [ ] Alertas críticos corrigidos
- [ ] Só então enviar a nova versão para revisão pública
