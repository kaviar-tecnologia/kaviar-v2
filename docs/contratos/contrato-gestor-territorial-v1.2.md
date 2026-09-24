# Contrato de Parceria Operacional Territorial KAVIAR — v1.2

**Status:** versão jurídica canônica em revisão técnica.  
**Não utilizar para assinatura até o merge/deploy e a aprovação final do PR.**

## Fonte canônica

O texto que o gerador automático de PDF utiliza está definido em:

`backend/src/services/contracts/territorial-manager-contract-v1_2.ts`

A razão para manter uma fonte canônica executável é impedir a divergência que existia na v1.1 entre o documento jurídico e o PDF produzido pelo backend.

## Estrutura da v1.2

O PDF gerado contém, no mesmo instrumento:

1. **Contrato Principal**
   - definições;
   - objeto e delimitação territorial;
   - natureza autônoma da relação;
   - responsabilidades do Gestor;
   - prospecção comercial sem poderes de representação;
   - responsabilidades da KAVIAR;
   - marca e propriedade intelectual;
   - participação econômica de 40%;
   - fato gerador e Operação Elegível;
   - apuração, contestação e pagamento;
   - tributos e retenções;
   - Área Reservada / Área de Sombra;
   - confidencialidade;
   - proteção de dados;
   - integridade e anticorrupção;
   - vigência por prazo indeterminado;
   - suspensão e rescisão;
   - responsabilidade, força maior e regulação;
   - comunicações, cessão, tolerância e nulidade parcial;
   - assinatura eletrônica e hierarquia documental;
   - foro.

2. **Anexo Comercial I — Participação Territorial**
   - 40% da Taxa da Plataforma Elegível ao Gestor em território financeiramente ativo;
   - 0% ao Gestor em Área de Sombra;
   - referência atual de taxa da plataforma de 18%;
   - exclusões e ajustes;
   - ausência de taxa obrigatória de adesão/habilitação.

3. **Anexo Territorial II — Delimitação e Versão**
   - `territory_id`;
   - versão territorial por hash SHA-256 da composição;
   - bairros/comunidades vinculados;
   - Manager Assignment ID e status na geração;
   - critério técnico baseado no bairro de origem (`origin_neighborhood_id`);
   - versionamento prospectivo;
   - Área Reservada / Área de Sombra;
   - nenhuma ativação financeira pela simples assinatura.

4. **Anexo LGPD III — Tratamento de Dados Pessoais**
   - KAVIAR como Controladora;
   - Gestor como Operador quando atuar sob instruções da KAVIAR;
   - minimização e finalidade;
   - controle de acesso;
   - incidente em até 24 horas;
   - suboperadores;
   - retenção e eliminação;
   - cooperação, auditoria e confidencialidade.

## Identificação PF/PJ

O gerador v1.2 diferencia:

- Pessoa Física: nome, CPF e RG;
- Pessoa Jurídica/Associação: razão social, nome fantasia, CNPJ, representante legal e CPF do representante.

## Ativação Financeira

A data de geração ou assinatura do PDF **não é data de início financeiro**. O PDF documenta também o assignment territorial existente, mas somente assignment financeiramente elegível com status `active`, administrador ativo e vigência válida produz participação segundo o motor atual.

A v1.2 declara expressamente que a Ativação Financeira depende de registro específico e válido nos sistemas da KAVIAR.

## Referências dos anexos

- `docs/contratos/anexo-territorial-gestor-v1.2.md`
- `docs/contratos/anexo-lgpd-gestor-v1.2.md`

## Histórico

A v1.1 permanece no repositório somente para histórico e comparação, marcada como superada para novas contratações.
