# Draft objetivo para Google Play Console (Data Safety + App Content)

Status: rascunho operacional para preenchimento no Console.
Escopo: apps Android Kaviar Passageiro e Kaviar Motorista.
Critério: postura conservadora para reduzir risco de rejeicao em revisao.

## 0) Contexto e versoes auditadas

- App Passageiro: `com.kaviar.passenger` (versionCode 22).
- App Motorista: `com.kaviar.driver` (versao 1.12.3, versionCode 8).
- API principal: `https://api.kaviar.com.br`.
- Integrações relevantes identificadas no codigo: Google Maps, Expo Notifications/Push, Asaas, SumUp, AWS S3, Twilio (backend).

---

## 1) Dados coletados - Passageiro

Preencher no Data Safety do app Passageiro como **coletados**:

1. Informacoes pessoais
- Nome
- E-mail
- Telefone
- CPF (quando solicitado no cadastro)

2. Localizacao
- Localizacao aproximada e precisa (foreground)
- Localizacao durante corrida quando usuario ativa compartilhamento com motorista

3. Atividade no app
- Interacoes de corrida (solicitacao, status, mensagens operacionais da corrida)
- Historico de notificacoes internas

4. IDs do app/dispositivo
- Expo push token
- FCM token (quando disponivel)

5. Diagnostico/telemetria operacional
- Eventos tecnicos de registro de push token (status de permissao e etapas de registro)

Observacao: nao foi identificado uso de permissao de localizacao em segundo plano no pacote Passageiro.

---

## 2) Dados coletados - Motorista

Preencher no Data Safety do app Motorista como **coletados**:

1. Informacoes pessoais
- Nome
- E-mail
- Telefone
- CPF, RG, CNH

2. Documentos e arquivos
- Comprovante de residencia
- Foto do veiculo
- Antecedentes criminais
- Foto de perfil (opcional)
- Arquivos de imagem/PDF enviados no onboarding/compliance

3. Localizacao
- Localizacao aproximada e precisa (foreground)
- Localizacao precisa durante o servico, inclusive quando o app esta minimizado e nao visivel, por meio de foreground service iniciado pelo motorista; o app nao solicita `ACCESS_BACKGROUND_LOCATION`.
- Atualizacoes de localizacao para tracking de corrida

4. Dados financeiros/transacionais
- Eventos de recarga de carteira
- IDs de pagamento (Asaas/SumUp)
- Status de transacao (pending/confirmed/expired)

5. IDs do app/dispositivo
- Expo push token
- FCM token (quando disponivel)

---

## 3) Dados compartilhados com terceiros (declaracao conservadora)

Se a politica interna for conservadora, declarar como **compartilhados**:

1. Com provedores de pagamento
- Asaas (Pix)
- SumUp (checkout hospedado)
- Passageiro: provedores de pagamento somente se houver fluxo de pagamento ativo para passageiro.
- Categoria de dados: dados de transacao e identificadores de pagamento.

2. Com provedores de comunicacao
- Twilio (fluxos de WhatsApp/voz no backend)
- Categoria de dados: telefone e metadados de mensagem (quando funcionalidade for usada).

3. Com provedores de infraestrutura
- AWS (armazenamento/processamento, incluindo uploads em S3)
- Categoria de dados: documentos e dados operacionais armazenados.

4. Com provedores de mapa/localizacao
- Google Maps SDK/servicos
- Categoria de dados: localizacao e telemetria tecnica associada ao uso de mapas/rotas.

Nota de risco: se o time juridico interpretar que alguns desses fluxos sao "processor" e nao "sharing", ainda assim a declaracao conservadora reduz risco de inconsistência em revisao.

---

## 4) Finalidades de uso (Play Console)

Marcar finalidades tipicas para os dados acima:

1. Funcionalidade do app
- Matching de corridas, navegacao, tracking da corrida, recarga da carteira, onboarding de motorista.

2. Comunicacao
- Notificacoes push, avisos de status de corrida e alertas operacionais.

3. Seguranca e prevencao de fraude
- Validacao de cadastro, compliance documental, auditoria de operacoes, anti-abuso.

4. Suporte e operacao
- Diagnosticos tecnicos, investigacao de falhas, tratamento de incidentes.

Nao marcar "Publicidade" ou "Venda de dados" sem evidência objetiva.

Declaracoes para Passageiro e Motorista:
- Não vendemos dados pessoais.
- Não usamos dados para publicidade comportamental.

---

## 5) Obrigatoriedade x opcional (sugestao de preenchimento)

Passageiro:

1. Obrigatorio
- Nome, e-mail, telefone, localizacao em uso para corrida, dados basicos de uso da corrida.

2. Opcional/condicional
- Compartilhar localizacao com motorista durante corrida (toggle no app).
- Permissao de notificacao (usuario pode negar).

Motorista:

1. Obrigatorio
- Identificacao pessoal e documental para aprovacao.
- Localizacao precisa durante o uso e, enquanto o motorista permanece online ou em uma corrida, continuidade da coleta com o app minimizado por meio de foreground service; sem `ACCESS_BACKGROUND_LOCATION`.

2. Opcional/condicional
- Permissao de notificacao.
- Alguns documentos/fotos opcionais conforme fluxo especifico.

---

## 6) Seguranca declaravel no Play Console

Pode marcar como "sim" (desde que confirmado no backend/producao):

1. Dados em transito sao criptografados
- Evidencia: uso de HTTPS/TLS nas URLs de API e provedores.

2. Solicitacao de exclusao de conta/dados disponivel
- Evidencia: pagina publica de exclusao de conta e fluxo operacional associado.
- URL publica: https://kaviar.com.br/excluir-conta

Ponto de validacao antes de envio:
- Confirmar politicas de retencao e exclusao em banco/arquivos (incluindo S3) para evitar divergencia entre declaracao e pratica.

---

## 7) Permissoes sensiveis e risco de revisao

Passageiro:

1. Localizacao foreground
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.

Motorista:

1. Localizacao precisa
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.
- Utilizada quando o motorista escolhe permanecer online ou durante uma corrida.

2. Servico de localizacao em primeiro plano
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`.
- Mantem a atualizacao de posicao quando o app esta minimizado, com notificacao persistente do Android.
- A versao 1.12.3 (8) nao solicita `ACCESS_BACKGROUND_LOCATION`.

3. Notificacoes
- `POST_NOTIFICATIONS`.

Atencao na revisao (Motorista):
- O disclosure interno deve aparecer imediatamente antes da solicitacao da permissao de localizacao do Android.
- Mensagens in-app, politica de privacidade e Play Console devem refletir o uso quando o motorista esta online ou em corrida.
- Nao declarar `ACCESS_BACKGROUND_LOCATION` para a versao 1.12.3 (8), pois essa permissao nao existe no AAB.

---

## 8) App Content (questionarios adicionais)

Preenchimento recomendado:

1. Acesso total a recursos do dispositivo
- Declarar apenas o necessario (localizacao, camera/arquivos no fluxo de documentos do Motorista, notificacoes).

2. Dados sensiveis de saude/financas
- Nao marcar saude.
- Para financas, marcar apenas o que realmente ocorre (recarga/pagamento operacional), sem exagero.

3. Conteudo gerado por usuario/comunicacao
- Se aplicavel, indicar que ha comunicacao operacional e notificacoes de servico.

4. Publico-alvo
- Manter coerencia com termos, politica de privacidade e fluxo de cadastro.

---

## 9) Pendencias para confirmar antes do envio

1. Confirmar com juridico/compliance a fronteira "coleta" vs "compartilhamento" em cada integracao.
2. Confirmar politica de retencao/exclusao para documentos de motorista (banco + S3).
3. Confirmar texto final de privacidade e termos ja publicados e alinhados com o formulario do Play.
4. Confirmar se todos SDKs/servicos de producao estao mapeados (inclusive analytics/crash se houver fora deste recorte).
5. Revisar screenshots e descricao da Play Store para coerencia com a continuidade da localizacao quando o app esta minimizado durante o modo online/corrida, usando foreground service e sem `ACCESS_BACKGROUND_LOCATION`.

---

## 10) Formato pratico para copiar no Play Console

### 10.1 Kaviar Passageiro - resumo direto

- Coleta dados pessoais: Sim (nome, email, telefone, CPF quando aplicavel)
- Coleta localizacao: Sim (foreground; compartilhamento durante corrida quando habilitado)
- Coleta IDs do dispositivo/app: Sim (expo token, fcm token)
- Compartilha dados com terceiros: Sim (maps/infra/pagamento, conforme fluxo)
- Criptografia em transito: Sim
- Exclusao de conta/dados: Sim (fluxo publico disponivel)
- Não vendemos dados pessoais.
- Não usamos dados para publicidade comportamental.

Finalidades:
- Funcionalidade do app
- Comunicacao
- Seguranca/fraude
- Suporte operacional

### 10.2 Kaviar Motorista - resumo direto

- Coleta dados pessoais: Sim (nome, email, telefone, CPF, RG, CNH)
- Coleta documentos/arquivos: Sim (imagem/PDF de compliance)
- Coleta localizacao: Sim (localizacao precisa durante o uso e continuidade quando online/em corrida com o app minimizado via foreground service; sem `ACCESS_BACKGROUND_LOCATION`).
- Coleta dados financeiros/transacionais: Sim (recargas e status)
- Coleta IDs do dispositivo/app: Sim (expo token, fcm token)
- Compartilha dados com terceiros: Sim (pagamentos, infraestrutura, comunicacao, mapas)
- Criptografia em transito: Sim
- Exclusao de conta/dados: Sim (fluxo publico disponivel)
- Não vendemos dados pessoais.
- Não usamos dados para publicidade comportamental.

Finalidades:
- Funcionalidade do app
- Comunicacao
- Seguranca/fraude
- Suporte operacional

---

## Arquivos inspecionados nesta auditoria

- `app.config.js`
- `eas.json`
- `package.json`
- `src/services/background-location.ts`
- `src/services/passenger-push-token.service.ts`
- `app/(passenger)/map.tsx`
- `app/(driver)/documents.tsx`
- `app/services/documentApi.ts`
- `src/config/env.ts`
- `src/api/driver.api.ts`
- `backend/src/routes/driver-wallet-v2.ts`
- `backend/src/routes/drivers.ts`
- `backend/src/routes/drivers-v2.ts`
- `backend/src/routes/passenger-profile.ts`
- `backend/prisma/schema.prisma`

## Observacao final

Este arquivo e um draft tecnico-operacional. Antes de submeter no Google Play Console, validar com responsavel juridico/LGPD para garantir aderencia integral entre formulario, politica publica e implementacao real.