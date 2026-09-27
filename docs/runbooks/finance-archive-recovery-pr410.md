# PR #410 — inventário de recuperação de reservas de extratos (somente leitura)

Objetivo: depois da fundação de cofre #409, detectar reservas que precisam de
conferência humana. Nunca mover dinheiro, apagar/regravar objeto, baixar bytes,
atestar origem oficial, declarar faturamento zero ou fechar a competência.

Rota (somente se #409 tiver sido ATIVADO após aprovação operacional):
`GET /api/admin/finance/monthly-close/evidence/official-archive/recovery?legal_entity_id=UUID&year=2026&month=8`.
Exige SUPER_ADMIN e configuração privada completa. Sem modo público.

O resultado expõe apenas ID interno de registro, conta interna, provedor,
competência, status, idade em minutos e código de ação. **Nunca** retorna
bucket, chave de objeto, hash, conteúdo, URL de download, valores ou endereço.

Triagem:
- `RESERVED` com menos de 15 min: reserva recente; reexaminar sem pressupor erro.
- `RESERVED` com 15 min ou mais: conferir manualmente se existe objeto no S3,
  sua integridade e a trilha de auditoria; **não** supor que o upload falhou.
- `STORED_UNVERIFIED`: bytes conferidos à época do upload, origem ainda NÃO
  comprovada. Retenção, varredura e autenticidade exigem etapas separadas.
- Relógio futuro/estado inesperado: erro ou revisão manual, sem liberar nada.
- Mais de 100 registros: falha explícita de paginação, para não indicar um
  inventário completo baseado numa amostra parcial.

Não faz GET, HEAD, PUT ou DELETE no S3; não atualiza banco e não reenvia arquivo.
Toda resposta mantém `officialStatementsVerified=false`,
`zeroRevenueVerified=false`, `readyForFinalClosing=false` e
`finalClosing=false`. As pendências de SUMUP, ASAAS e contador seguem
separadas e não são satisfeitas por um manifesto de teste.

Sem migration nova, flags, IAM, AWS, deploy ou alteração de RDS neste PR.
O workflow testa unidade, API, isolamento CNPJ e consulta em PostgreSQL
descartável. Não há extratos reais fornecidos ou verificados nesta etapa.
