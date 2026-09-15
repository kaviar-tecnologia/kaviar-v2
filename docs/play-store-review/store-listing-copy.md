# KAVIAR - Textos para Google Play Store

## KAVIAR Passageiro

### Nome do app

KAVIAR Passageiro

### Descrição curta

Peça corridas, acompanhe o motorista e viaje com mais praticidade.

### Descrição completa

O KAVIAR Passageiro conecta você a motoristas disponíveis na sua região, com uma experiência simples, segura e prática para solicitar corridas.

Com o app, você pode pedir uma corrida, acompanhar o andamento da solicitação, visualizar informações da viagem, receber notificações importantes e se comunicar com o motorista durante a corrida por mensagens internas do próprio aplicativo.

O KAVIAR foi criado para atender comunidades e regiões com uma operação mais próxima, organizada e transparente.

Principais recursos:

- Solicitação de corrida pelo app.
- Acompanhamento da corrida.
- Comunicação interna com o motorista sem exposição de telefone.
- Notificações sobre o status da viagem.
- Recursos de segurança e suporte operacional.
- Serviços e modalidades conforme disponibilidade da região.

A disponibilidade de motoristas, serviços e modalidades pode variar conforme a cidade, região e operação local.

### Texto de novidades

Primeira versão de preparação para publicação na Google Play, com melhorias de segurança, estabilidade e compatibilidade Android.

### Instruções para o revisor

Use a conta de teste de passageiro informada no Play Console.

Após login, acesse a tela inicial, consulte as opções disponíveis, inicie uma solicitação de corrida em ambiente de teste e verifique o acompanhamento da solicitação e as mensagens internas.

O app usa localização para definir origem da corrida, melhorar a experiência de solicitação e exibir informações relacionadas à viagem.

## KAVIAR Motorista

### Nome do app

KAVIAR Motorista

### Descrição curta

Receba corridas, fique online e acompanhe suas viagens pelo app.

### Descrição completa

O KAVIAR Motorista é o aplicativo para motoristas parceiros acompanharem sua operação, ficarem online, receberem chamadas de corrida e gerenciarem viagens pela plataforma KAVIAR.

Com o app, o motorista pode acessar sua conta, acompanhar status operacional, ficar disponível para receber corridas, visualizar informações da viagem, receber notificações e usar recursos de comunicação interna com o passageiro sem exposição de telefone.

A localização é usada para permitir que o motorista fique disponível na plataforma, receba corridas próximas e tenha sua posição atualizada durante a corrida, quando estiver online ou em viagem.

Principais recursos:

- Acesso do motorista parceiro.
- Status online para disponibilidade.
- Recebimento de chamadas de corrida.
- Acompanhamento da viagem.
- Comunicação interna com o passageiro sem exposição de telefone.
- Notificações operacionais.
- Recursos de segurança e suporte.
- Gestão de informações relacionadas às viagens.

A operação, disponibilidade de chamadas e modalidades podem variar conforme cidade, região e aprovação do motorista na plataforma.

### Texto de novidades

Primeira versão de preparação para publicação na Google Play, com melhorias de segurança, estabilidade e compatibilidade Android.

### Instruções para o revisor

Use a conta de teste de motorista informada no Play Console.

Após login, acesse a tela principal do motorista e toque em **Ficar Online**. O KAVIAR apresenta primeiro a explicação **Uso da sua localização** e somente depois solicita a permissão de localização do Android.

Enquanto o motorista escolhe permanecer online, o Android mantém a atualização de localização por meio de um serviço em primeiro plano com notificação persistente. A localização é usada para disponibilidade operacional, corridas próximas e acompanhamento de corridas.

### Uso de localização no Motorista

O KAVIAR Motorista não solicita `ACCESS_BACKGROUND_LOCATION`. A continuidade da atualização de posição com o aplicativo minimizado é realizada por um serviço de localização em primeiro plano (`FOREGROUND_SERVICE_LOCATION`) com notificação persistente ao usuário.
