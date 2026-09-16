import LegalMarkdownPage from './LegalMarkdownPage';

const publicPrivacyMarkdown = `# Política de Privacidade e Proteção de Dados — KAVIAR

**Versão:** v1.0  
**Data:** Maio/2026

## 1. Controlador dos Dados

**KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA**  
CNPJ: 67.783.601/0001-99

**Canais de atendimento ao titular:**
- E-mail: suporte@kaviar.com.br
- WhatsApp: +55 21 96864-8777

## 2. Dados Coletados

### Passageiros
- Nome, telefone e e-mail.
- Localização de origem e destino.
- Histórico de corridas e avaliações.
- Dados de pagamento quando aplicável.

### Motoristas
- Nome, CPF, RG, CNH, endereço, telefone e e-mail.
- Dados do veículo e documentos vinculados.
- Localização precisa para operação do serviço. Enquanto o motorista escolher permanecer online ou estiver em uma corrida, a localização poderá continuar sendo coletada em segundo plano, inclusive com o aplicativo minimizado, para manter a disponibilidade, localizar corridas e atualizar a posição durante o serviço. A coleta operacional é interrompida quando o motorista fica offline.
- Histórico de corridas, avaliações e repasses.
- Dados bancários/Pix para recebimento.

## 3. Finalidades de Uso

Os dados são usados para:
- operação da plataforma de mobilidade;
- segurança, prevenção de fraude e auditoria;
- cálculo de rotas, corridas e cobranças;
- suporte ao usuário e comunicação operacional;
- cumprimento de obrigações legais e regulatórias.

## 4. Compartilhamento de Dados

Podemos compartilhar dados com:
- passageiro e motorista durante a corrida, na medida necessária para o serviço;
- prestadores de tecnologia e infraestrutura (ex.: cloud, notificações, pagamentos);
- autoridades públicas quando houver obrigação legal.

Não comercializamos dados pessoais.

## 5. Retenção e Segurança

- Dados são armazenados em infraestrutura com controles de acesso e proteção em trânsito.
- Mantemos registros pelo tempo necessário para operação, segurança e exigências legais.
- Após os prazos aplicáveis, os dados são anonimizados ou excluídos conforme política interna.

## 6. Direitos do Titular

Você pode solicitar:
- confirmação de tratamento;
- acesso e correção de dados;
- anonimização, bloqueio ou eliminação quando cabível;
- informações sobre compartilhamento;
- revogação de consentimento, quando aplicável.

As solicitações são tratadas pelos canais oficiais informados acima.

## 7. Exclusão de Conta e Dados

Para solicitar exclusão de conta e dados, acesse: **/excluir-conta**.

## 8. Atualizações desta Política

Esta política pode ser atualizada periodicamente para refletir evolução operacional e requisitos legais.
`;

export default function PrivacyPolicyPage() {
  return (
    <LegalMarkdownPage
      title="Política de Privacidade"
      subtitle="Transparência sobre coleta, uso e proteção de dados pessoais na plataforma KAVIAR."
      markdown={publicPrivacyMarkdown}
    />
  );
}
