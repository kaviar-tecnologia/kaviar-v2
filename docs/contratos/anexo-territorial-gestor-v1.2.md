# ANEXO TERRITORIAL II — DELIMITAÇÃO E VERSÃO

**Contrato:** Parceria Operacional Territorial KAVIAR v1.2  
**Status:** modelo de referência; o PDF automático usa a definição canônica em `backend/src/services/contracts/territorial-manager-contract-v1_2.ts`.

## IDENTIFICAÇÃO

- Gestor: [NOME / RAZÃO SOCIAL]
- Territory ID: [TERRITORY_ID]
- Nome do território: [TERRITÓRIO]
- Cidade/UF: [CIDADE/UF]
- Versão territorial: [TIMESTAMP/IDENTIFICADOR DA VERSÃO]
- Bairros/comunidades vinculados nesta versão: [LISTA]
- Ativação Financeira: **não é criada por este anexo**; depende de registro específico e válido nos sistemas da KAVIAR.

## 1. REGRA DE DELIMITAÇÃO

O território remunerado corresponde exclusivamente ao `territory_id` e à composição territorial registrados na versão aplicável. A indicação de cidade, município, zona ou bairro ampliado não significa atribuição automática de toda a respectiva área ao Gestor.

## 2. CRITÉRIO TÉCNICO DE ALOCAÇÃO DA CORRIDA

Na versão atual do backend, a corrida é associada ao território do bairro de origem (`origin_neighborhood_id`) no momento do settlement.

Somente operação cujo bairro de origem esteja vinculado ao `territory_id` deste Anexo poderá ser considerada territorialmente elegível, observados os demais requisitos do Contrato.

## 3. ÁREAS RESERVADAS KAVIAR / ÁREA DE SOMBRA

Áreas não vinculadas ao `territory_id` deste Anexo, ou vinculadas a território sem assignment financeiro ativo para o Gestor, não integram a participação econômica do Gestor.

Operações reconhecidas em Área Reservada KAVIAR / Área de Sombra geram 0% ao Gestor e 100% da Taxa da Plataforma Elegível permanece com a KAVIAR.

## 4. VERSIONAMENTO E EFEITOS PROSPECTIVOS

A versão territorial indicada neste Anexo constitui referência probatória da delimitação existente na geração do documento.

Alterações posteriores:

- somente produzirão efeitos prospectivos;
- deverão permanecer auditáveis;
- não poderão retirar participação relativa a operações já reconhecidas sob versão anterior;
- quando representarem redução material de território, observarão o aviso contratual aplicável, salvo exceções legais, regulatórias, de segurança, fraude ou risco operacional.

## 5. COERÊNCIA TÉCNICA

Nenhuma divisão territorial produzirá efeitos financeiros apenas por existir em documento. A delimitação precisa ser tecnicamente reconhecível pelo backend no momento do settlement.

---

**Fonte canônica executável:** `backend/src/services/contracts/territorial-manager-contract-v1_2.ts`
