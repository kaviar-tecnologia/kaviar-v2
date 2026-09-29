# Gestor Territorial — cadastro próprio e conferência documental

Escopo: formulário autenticado em /admin/meu-cadastro, no perfil da própria gestora. Nada de CPF em CRM público, senha enviada por e-mail ou URL contendo dados pessoais.

- GET/PATCH /api/admin/my-operator-profile/registration: sessão TERRITORIAL_MANAGER, perfil individual próprio vinculado ao mesmo admin. Não aceita id de outro perfil no corpo.
- Atualização disponível só enquanto document_status= pending, contract_status=pending, sem PDF/minuta gerada e perfil operacional inativo; updateMany compara updated_at e estados.
- Campos permitidos: CPF válido pelos dígitos verificadores, endereço completo, RG/CIN opcional, chave/tipo Pix opcionais. CPF e Pix retornam apenas mascarados. O e-mail principal, nome/telefone, território e credenciais não são editáveis neste formulário.
- Audit registra nomes de campos alterados, nunca CPF, endereço, RG ou chave Pix em texto claro.
- O diagnóstico da minuta v1.2 lê os campos persistidos em operator_profiles, sem segunda base. Pix não é obrigatório para a minuta, mas não libera repasse.
- Verificação documental pelo SUPER_ADMIN exige dados de PF (nome e CPF válido) ou de PJ/associação (empresa, CNPJ válido (numérico ou alfanumérico), representante legal e CPF válido), endereço, e-mail, telefone e checklist completo no backend. Se Pix informado, valida formato/tipo. A conferência de documento e titularidade é humana; o sistema não alega homologação automática.
- Não muda status de documentos na gravação da gestora. Não cria assignment, minuta, contrato, acesso, participação ou ativação financeira.
- Sem migrations, seeds, flags, secrets, CARE, SumUp, Asaas, workers ou deploy automático.

A conta só deve ser comunicada à gestora depois da revisão e aprovação da KAVIAR. Preferir o fluxo autenticado de recuperação de senha, sem divulgar credenciais no CRM.
