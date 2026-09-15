# Play Store — Data Safety Declaration

Mapeamento para preencher o formulário "Data safety" no Google Play Console.

## Kaviar Passageiro

### Dados coletados

| Tipo de dado | Coletado | Compartilhado | Finalidade | Obrigatório |
|---|---|---|---|---|
| Nome | ✅ | Com motorista (durante corrida) | Funcionalidade do app | Sim |
| E-mail | ✅ | Não | Gerenciamento de conta | Sim |
| Telefone | ✅ | Não | Gerenciamento de conta, segurança, comunicação operacional | Sim |
| Localização aproximada | ✅ | Com motorista (durante corrida) | Funcionalidade do app | Sim |
| Localização precisa | ✅ | Com motorista (durante corrida) | Funcionalidade do app | Sim |
| Histórico de corridas | ✅ | Não | Funcionalidade do app | Sim |
| Device ID / tokens push | ✅ | Não | Funcionalidade do app (notificações) | Sim |

### Práticas de segurança
- ✅ Dados criptografados em trânsito (TLS)
- ✅ Usuário pode solicitar exclusão de dados
- ❌ Dados NÃO são vendidos a terceiros

### Telefone
- Coletado para cadastro, segurança, suporte e comunicação operacional (notificações WhatsApp server-side)
- **Não é compartilhado diretamente** entre passageiro e motorista pelo app
- Comunicação entre usuários ocorre por canais oficiais do KAVIAR (cards de status operacional)

### Localização
- Utilizada quando o motorista escolhe permanecer **online** ou durante uma corrida.
- Quando o app é minimizado, o Android mantém as atualizações por meio de um **serviço de localização em primeiro plano** com notificação persistente.
- Ao ficar offline, o serviço de localização é interrompido.
- A versão 1.12.3 (8) não solicita `ACCESS_BACKGROUND_LOCATION`.

---

## Uso de localização com o app minimizado (Motorista)

> O KAVIAR Motorista usa localização quando o motorista escolhe permanecer online ou durante uma corrida. Com o app minimizado, as atualizações continuam por `FOREGROUND_SERVICE_LOCATION`, com notificação persistente. A versão 1.12.3 (8) não solicita `ACCESS_BACKGROUND_LOCATION` nem a opção "Permitir o tempo todo".

---

## Permissões declaradas

### Motorista
| Permissão | Justificativa |
|-----------|---------------|
| ACCESS_FINE_LOCATION | Posição precisa para matching e acompanhamento da corrida |
| ACCESS_COARSE_LOCATION | Localização aproximada quando aplicável |
| FOREGROUND_SERVICE | Executar o serviço visível enquanto o motorista permanece online |
| FOREGROUND_SERVICE_LOCATION | Manter atualizações de localização com notificação persistente |
| POST_NOTIFICATIONS | Alertas de corrida e notificações operacionais |
| INTERNET | Comunicação com servidor |
| VIBRATE | Alerta tátil de nova corrida |

### Passageiro
| Permissão | Justificativa |
|-----------|---------------|
| ACCESS_FINE_LOCATION | Encontrar motoristas próximos |
| POST_NOTIFICATIONS | Atualizações de status da corrida |
| INTERNET | Comunicação com servidor |
| VIBRATE | Alerta tátil |

### Permissões NÃO solicitadas
- ❌ `ACCESS_BACKGROUND_LOCATION`
- ❌ Contatos
- ❌ SMS
- ❌ Chamadas telefônicas

### Notas sobre permissões no APK

**CAMERA** — presente em ambos os APKs. Vem do `expo-image-picker` (upload de documentos no cadastro motorista e possivelmente foto de perfil). Declarar no Data Safety como "coletado para verificação de identidade".

**RECORD_AUDIO / MODIFY_AUDIO_SETTINGS** — vem do `expo-av` (reprodução da vinheta KAVIAR). Não é usado para gravar áudio do usuário. Pode ser necessário justificar ao Google que é apenas para reprodução de som de notificação.

**READ/WRITE_EXTERNAL_STORAGE** — legado do Expo, não usado ativamente. Em Android 13+ é ignorado pelo sistema.

**Permissões de badge** (Samsung, Huawei, Oppo, etc.) — injetadas automaticamente pelo expo-notifications para badge count. Inofensivas.

### Permissões de localização verificadas no AAB Motorista v1.12.3 (8)

```text
ACCESS_COARSE_LOCATION
ACCESS_FINE_LOCATION
FOREGROUND_SERVICE
FOREGROUND_SERVICE_LOCATION
```

O AAB v1.12.3 (8) foi verificado e **não contém `ACCESS_BACKGROUND_LOCATION`**.

A lista acima registra somente as permissões relacionadas à localização e ao serviço de localização.

### Permissões reais do APK Passageiro (v1.11.3)
```
ACCESS_COARSE_LOCATION
ACCESS_FINE_LOCATION
INTERNET
MODIFY_AUDIO_SETTINGS
READ_EXTERNAL_STORAGE
RECORD_AUDIO
SYSTEM_ALERT_WINDOW
VIBRATE
WRITE_EXTERNAL_STORAGE
ACCESS_NETWORK_STATE
ACCESS_WIFI_STATE
CAMERA
RECEIVE_BOOT_COMPLETED
POST_NOTIFICATIONS
WAKE_LOCK
FOREGROUND_SERVICE
```

**Nota:** Na versão atual, nem o Motorista v1.12.3 (8) nem o Passageiro solicitam `ACCESS_BACKGROUND_LOCATION` ✅
