# KAVIAR Motorista - Uso de Localização no Android

## App

KAVIAR Motorista

## Pacote Android

com.kaviar.driver

## Versão

- Version name: 1.12.3
- Version code: 8

## Permissões relacionadas

O KAVIAR Motorista utiliza:

- android.permission.ACCESS_FINE_LOCATION
- android.permission.ACCESS_COARSE_LOCATION
- android.permission.FOREGROUND_SERVICE
- android.permission.FOREGROUND_SERVICE_LOCATION

O aplicativo **não solicita**:

- android.permission.ACCESS_BACKGROUND_LOCATION

## Funcionalidade principal que utiliza localização

A localização é necessária para conectar passageiros a motoristas próximos, manter a posição operacional do motorista atualizada e permitir o acompanhamento de uma corrida.

O uso é iniciado somente depois que o próprio motorista escolhe **Ficar Online**.

Antes da solicitação da permissão de localização do Android, o aplicativo apresenta uma explicação dentro do KAVIAR informando como e por que a localização será utilizada.

## Quando a localização é usada

A localização é utilizada quando:

1. O motorista escolhe ficar online.
2. O motorista está disponível para receber solicitações de corrida.
3. O motorista aceita uma corrida.
4. A corrida está em andamento.
5. A posição precisa ser atualizada para proximidade, rota e acompanhamento operacional.

Quando o motorista escolhe ficar offline, o serviço de localização é interrompido.

## Funcionamento com o aplicativo minimizado

Enquanto o motorista permanece online, o Android executa um **serviço de localização em primeiro plano (foreground service)**.

Esse serviço exibe uma notificação persistente ao usuário:

**Kaviar Motorista — Compartilhando localização**

Isso permite que a posição continue sendo atualizada quando o aplicativo estiver minimizado, sem solicitar a permissão `ACCESS_BACKGROUND_LOCATION`.

O uso permanece visível ao motorista por meio da notificação do Android e pode ser interrompido ficando offline no aplicativo.

## Benefício para o usuário

Para o passageiro:

- localizar motoristas próximos;
- acompanhar a chegada do motorista;
- acompanhar uma corrida aceita;
- melhorar estimativas de distância e tempo.

Para o motorista:

- receber solicitações compatíveis com sua localização;
- permanecer disponível enquanto escolhe ficar online;
- continuar uma corrida sem perder a atualização operacional ao minimizar o aplicativo.

## Limites de uso

A localização não é utilizada para publicidade, venda de dados ou rastreamento sem relação com a operação de mobilidade.

O motorista controla o início e o término do compartilhamento por meio dos estados **Online** e **Offline** do aplicativo.

## Fluxo apresentado ao revisor

1. Autenticar no KAVIAR Motorista.
2. Tocar em **Ficar Online**.
3. O KAVIAR apresenta a tela **Uso da sua localização**.
4. O motorista toca em **Continuar**.
5. Somente então o Android apresenta a solicitação de permissão de localização.
6. Após a autorização, o motorista fica online.
7. O Android exibe a notificação persistente **Kaviar Motorista — Compartilhando localização**.
8. O aplicativo não solicita a opção **Permitir o tempo todo** e não solicita `ACCESS_BACKGROUND_LOCATION`.

## Texto curto para revisão

O KAVIAR Motorista usa a localização quando o motorista escolhe permanecer online ou durante uma corrida. No Android, a continuidade da atualização de posição com o aplicativo minimizado é realizada por um serviço de localização em primeiro plano com notificação persistente. A versão 1.12.3 não solicita `ACCESS_BACKGROUND_LOCATION`.
