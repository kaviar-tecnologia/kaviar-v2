import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), '..', relativePath), 'utf8');
}

describe('territorial v1.2 system alignment', () => {
  it('blocks generic admin bypasses for territorial manager contracts', () => {
    const src = readRepoFile('backend/src/routes/admin-payouts.ts');
    expect(src).toContain("Gestor Territorial exige Contrato de Parceria Operacional Territorial v1.2");
    expect(src).toContain("não pode ser marcado como assinado por atualização manual");
    expect(src).toContain("Versão, PDF e data de assinatura do Gestor Territorial");
    expect(src).toContain("!existing.contract_reviewed_at");
    expect(src).toContain("upload direto de contrato não é permitido");
    expect(src).toContain("upload manual de modelo não é permitido");
  });

  it('uses Wallet V2 ledger recognition for manager finance', () => {
    const src = readRepoFile('backend/src/routes/admin-manager-finance.ts');
    expect(src).toContain("source: 'wallet_v2_territory_ledger'");
    expect(src).toContain("prisma.territory_ledger.aggregate");
    expect(src).toContain("manager_id: admin.id");
    expect(src).toContain("entry_type: 'fee_share'");
    expect(src).toContain("partner_commissions: 0");
    expect(src).toContain("financial_activation");
    expect(src).not.toContain("const regionalEstimated = fees * regionalPercent / 100");
  });

  it('freezes legacy percentage rules so they cannot redefine v1.2', () => {
    const src = readRepoFile('backend/src/routes/admin-territories.ts');
    expect(src).toContain("LEGACY_TERRITORY_FINANCE_RULES_READ_ONLY");
    expect(src).toContain("Regras percentuais legadas não podem alterar o Contrato v1.2");
  });

  it('requires express KAVIAR authorization for municipal protocols', () => {
    const backend = readRepoFile('backend/src/routes/admin-regulatory-consultation.ts');
    const card = readRepoFile('frontend-app/src/components/admin/DriverMunicipalRegularizationCard.jsx');
    expect(backend).toContain("somente quando houver autorização expressa da KAVIAR para o ato específico");
    expect(backend).not.toContain("atua apenas como representante operacional");
    expect(card).toContain("somente pode protocolar ou acompanhar");
    expect(card).toContain("autorização expressa da KAVIAR");
  });

  it('shows v1.2 financial activation separately from profile creation', () => {
    const route = readRepoFile('backend/src/routes/admin-my-operator-profile.ts');
    const page = readRepoFile('frontend-app/src/pages/admin/MyContractPage.jsx');
    expect(route).toContain("financial_activation: financialActivation");
    expect(route).toContain("status: 'active'");
    expect(page).toContain("Perfil criado em");
    expect(page).toContain("Ativação Financeira");
    expect(page).toContain("profile.financial_activation?.active");
  });

  it('does not treat manager not_required or online-only acceptance as healthy v1.2 status', () => {
    const page = readRepoFile('frontend-app/src/pages/admin/RegionalAdminsPage.jsx');
    expect(page).toContain("v1.2 formalizado");
    expect(page).toContain("Inconsistência contratual");
    expect(page).toContain("op.contract_status === 'not_required'");
  });

  it('labels legacy territorial simulations as non-contractual', () => {
    const page = readRepoFile('frontend-app/src/pages/admin/TerritoryDetailPage.jsx');
    expect(page).toContain("Regras Financeiras Legadas");
    expect(page).toContain("Somente leitura — não rege o v1.2");
    expect(page).toContain("Wallet V2");
  });

  it('aligns commercial materials with the definitive v1.2 contract', () => {
    const proposal = readRepoFile('docs/comercial/gestor-fundador-bairro-proposta.md');
    const faq = readRepoFile('docs/comercial/faq-gestor-fundador.md');
    const invite = readRepoFile('docs/comercial/mensagem-whatsapp-convite-gestor.md');
    const team = readRepoFile('docs/comercial/aditivo-equipe-captadores-gestor.md');
    const associations = readRepoFile('docs/comercial/prospeccao-associacoes-kaviar.md');

    expect(proposal).toContain("Contrato de Parceria Operacional Territorial v1.2");
    expect(proposal).toContain("programa piloto pré-contratual");
    expect(proposal).not.toContain("formalização ocorre mediante aceite digital do Termo de Autorização Operacional Territorial");

    expect(faq).toContain("contrato definitivo v1.2 é por prazo indeterminado");
    expect(faq).not.toContain("formalização ocorre mediante aceite do Termo de Autorização Operacional Territorial");

    expect(invite).toContain("piloto pré-contratual");
    expect(team).toContain("Contrato de Parceria Operacional Territorial v1.2");
    expect(associations).not.toContain("que possui taxa de ativação e termo operacional próprio");
  });

  it('manager finance UI states recognized values and shadow-area zero share', () => {
    const page = readRepoFile('frontend-app/src/pages/admin/ManagerFinance.jsx');
    expect(page).toContain("Wallet V2");
    expect(page).toContain("Participação reconhecida");
    expect(page).toContain("Área de Sombra");
    expect(page).toContain("0%");
    expect(page).toContain("Ativação Financeira");
  });
});
