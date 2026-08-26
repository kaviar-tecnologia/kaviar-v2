import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type FinanceCategorySeed = {
  idSource: string;
  code: string;
  name: string;
  kind: string;
  parent_code?: string | null;
  default_direction?: string | null;
  requires_document?: boolean;
  is_active?: boolean;
  is_postable: boolean;
  is_system?: boolean;
  sort_order?: number;
};

function financeCategoryId(source: string) {
  return `fcat_${createHash('md5').update(source).digest('hex')}`;
}

type FinanceCostCenterSeed = {
  code: string;
  name: string;
  type: string;
  parent_code?: string | null;
  territory_code?: string | null;
  city?: string | null;
  state?: string | null;
  is_active?: boolean;
};

type FinanceRecognitionPolicySeed = {
  code: string;
  subject: string;
  scope_type: string;
  policy: string;
  status: string;
  reason: string;
  notes?: string | null;
};

export const FINANCE_CATEGORY_SEEDS: FinanceCategorySeed[] = [
  { idSource: 'receita', code: 'RECEITAS_OPERACIONAIS', name: 'Receitas operacionais', kind: 'REVENUE', sort_order: 1000, default_direction: 'IN', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'receita.taxa_corrida', code: 'TAXA_CORRIDA', name: 'Taxa de corrida', kind: 'REVENUE', parent_code: 'RECEITAS_OPERACIONAIS', sort_order: 1010, default_direction: 'IN', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'receita.adesao_gestor', code: 'ADESAO_GESTOR', name: 'Adesão de gestor', kind: 'REVENUE', parent_code: 'RECEITAS_OPERACIONAIS', sort_order: 1020, default_direction: 'IN', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.despesas_municipais', code: 'GESTAO_TERRITORIAL', name: 'Gestão territorial', kind: 'REVENUE', parent_code: 'RECEITAS_OPERACIONAIS', sort_order: 1030, default_direction: 'IN', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'receita.servico_comercial', code: 'SERVICO_COMERCIAL', name: 'Serviço comercial', kind: 'REVENUE', parent_code: 'RECEITAS_OPERACIONAIS', sort_order: 1040, default_direction: 'IN', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'receita.outras_receitas', code: 'OUTRAS_RECEITAS', name: 'Outras receitas', kind: 'REVENUE', parent_code: 'RECEITAS_OPERACIONAIS', sort_order: 1050, default_direction: 'IN', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'receita.mensalidade', code: 'RECEITA_MENSALIDADE_LEGACY', name: 'Mensalidade (legado)', kind: 'REVENUE', parent_code: 'RECEITAS_OPERACIONAIS', sort_order: 1060, default_direction: 'IN', requires_document: false, is_active: false, is_postable: false, is_system: true },
  { idSource: 'despesa', code: 'DESPESAS_ADMINISTRATIVAS', name: 'Despesas administrativas', kind: 'EXPENSE', sort_order: 7000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'despesa.marketing', code: 'MARKETING_E_VENDAS', name: 'Marketing e vendas', kind: 'EXPENSE', sort_order: 6000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'impostos_e_taxas', code: 'IMPOSTOS_E_TAXAS', name: 'Impostos e taxas', kind: 'EXPENSE', sort_order: 2000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'impostos_e_taxas.irpj', code: 'IRPJ', name: 'IRPJ', kind: 'EXPENSE', parent_code: 'IMPOSTOS_E_TAXAS', sort_order: 2010, default_direction: 'OUT', requires_document: true, is_active: true, is_postable: true, is_system: true },
  { idSource: 'impostos_e_taxas.csll', code: 'CSLL', name: 'CSLL', kind: 'EXPENSE', parent_code: 'IMPOSTOS_E_TAXAS', sort_order: 2020, default_direction: 'OUT', requires_document: true, is_active: true, is_postable: true, is_system: true },
  { idSource: 'impostos_e_taxas.iss', code: 'ISS', name: 'ISS', kind: 'EXPENSE', parent_code: 'IMPOSTOS_E_TAXAS', sort_order: 2030, default_direction: 'OUT', requires_document: true, is_active: true, is_postable: true, is_system: true },
  { idSource: 'impostos_e_taxas.pis_cofins', code: 'PIS_COFINS', name: 'PIS/COFINS', kind: 'EXPENSE', parent_code: 'IMPOSTOS_E_TAXAS', sort_order: 2040, default_direction: 'OUT', requires_document: true, is_active: true, is_postable: true, is_system: true },
  { idSource: 'impostos_e_taxas.simples_nacional', code: 'SIMPLES_NACIONAL', name: 'Simples Nacional', kind: 'EXPENSE', parent_code: 'IMPOSTOS_E_TAXAS', sort_order: 2050, default_direction: 'OUT', requires_document: true, is_active: true, is_postable: true, is_system: true },
  { idSource: 'impostos_e_taxas.outros', code: 'OUTROS_IMPOSTOS', name: 'Outros impostos e taxas', kind: 'EXPENSE', parent_code: 'IMPOSTOS_E_TAXAS', sort_order: 2090, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'custos_diretos_plataforma', code: 'CUSTOS_DIRETOS_PLATAFORMA', name: 'Custos diretos da plataforma', kind: 'EXPENSE', sort_order: 3000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'operacoes_e_suporte', code: 'OPERACOES_E_SUPORTE', name: 'Operações e suporte', kind: 'EXPENSE', sort_order: 4000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'tecnologia_e_produto', code: 'TECNOLOGIA_E_PRODUTO', name: 'Tecnologia e produto', kind: 'EXPENSE', sort_order: 5000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'despesas_financeiras', code: 'DESPESAS_FINANCEIRAS', name: 'Despesas financeiras', kind: 'EXPENSE', sort_order: 8000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'receita.combo_premium', code: 'COMBO_PREMIUM', name: 'Combo premium', kind: 'EXPENSE', parent_code: 'MARKETING_E_VENDAS', sort_order: 6010, default_direction: 'OUT', requires_document: false, is_active: false, is_postable: false, is_system: true },
  { idSource: 'despesa.aws', code: 'AWS', name: 'AWS', kind: 'EXPENSE', parent_code: 'TECNOLOGIA_E_PRODUTO', sort_order: 5010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.github', code: 'GITHUB', name: 'GitHub', kind: 'EXPENSE', parent_code: 'TECNOLOGIA_E_PRODUTO', sort_order: 5015, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.cloudflare', code: 'CLOUDFLARE', name: 'Cloudflare', kind: 'EXPENSE', parent_code: 'TECNOLOGIA_E_PRODUTO', sort_order: 5020, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.google_play', code: 'GOOGLE_PLAY_STORE', name: 'Google Play Store', kind: 'EXPENSE', parent_code: 'TECNOLOGIA_E_PRODUTO', sort_order: 5030, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.expo', code: 'EXPO', name: 'Expo', kind: 'EXPENSE', parent_code: 'TECNOLOGIA_E_PRODUTO', sort_order: 5040, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.dominio', code: 'DOMINIOS_E_CERTIFICADOS', name: 'Domínios e certificados', kind: 'EXPENSE', parent_code: 'TECNOLOGIA_E_PRODUTO', sort_order: 5050, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.equipamentos', code: 'EQUIPAMENTOS_LEGACY', name: 'Equipamentos (legado)', kind: 'EXPENSE', parent_code: 'TECNOLOGIA_E_PRODUTO', sort_order: 5060, default_direction: 'OUT', requires_document: false, is_active: false, is_postable: false, is_system: true },
  { idSource: 'despesa.twilio', code: 'TWILIO', name: 'Twilio', kind: 'EXPENSE', parent_code: 'OPERACOES_E_SUPORTE', sort_order: 4010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.telefonia_internet', code: 'TELEFONIA_INTERNET', name: 'Telefonia e internet', kind: 'EXPENSE', parent_code: 'OPERACOES_E_SUPORTE', sort_order: 4020, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.juridico', code: 'REGULACAO_MUNICIPAL', name: 'Regulação municipal', kind: 'EXPENSE', parent_code: 'OPERACOES_E_SUPORTE', sort_order: 4030, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.taxas_municipais_corridas', code: 'TAXAS_MUNICIPAIS_SOBRE_CORRIDAS', name: 'Taxas municipais sobre corridas', kind: 'EXPENSE', parent_code: 'OPERACOES_E_SUPORTE', sort_order: 4040, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.gestores_territoriais', code: 'GESTORES_TERRITORIAIS', name: 'Gestores territoriais', kind: 'EXPENSE', parent_code: 'OPERACOES_E_SUPORTE', sort_order: 4050, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.licencas_municipais', code: 'LICENCAS_MUNICIPAIS', name: 'Licenças e taxas municipais', kind: 'EXPENSE', parent_code: 'OPERACOES_E_SUPORTE', sort_order: 4060, default_direction: 'OUT', requires_document: true, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.contabilidade', code: 'CONTABILIDADE', name: 'Contabilidade', kind: 'EXPENSE', parent_code: 'DESPESAS_ADMINISTRATIVAS', sort_order: 7010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.pro_labore', code: 'PRO_LABORE', name: 'Pró-labore', kind: 'EXPENSE', parent_code: 'DESPESAS_ADMINISTRATIVAS', sort_order: 7020, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.outras_despesas', code: 'OUTRAS_DESPESAS', name: 'Outras despesas', kind: 'EXPENSE', parent_code: 'DESPESAS_ADMINISTRATIVAS', sort_order: 7030, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.servicos_juridicos', code: 'SERVICOS_JURIDICOS', name: 'Serviços jurídicos', kind: 'EXPENSE', parent_code: 'DESPESAS_ADMINISTRATIVAS', sort_order: 7040, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.sumup', code: 'PROCESSAMENTO_PAGAMENTOS', name: 'Processamento de pagamentos', kind: 'EXPENSE', parent_code: 'DESPESAS_FINANCEIRAS', sort_order: 8010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.taxas_bancarias', code: 'TAXAS_BANCARIAS', name: 'Taxas bancárias', kind: 'EXPENSE', parent_code: 'DESPESAS_FINANCEIRAS', sort_order: 8020, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.reembolsos', code: 'REEMBOLSOS', name: 'Reembolsos', kind: 'EXPENSE', parent_code: 'DESPESAS_FINANCEIRAS', sort_order: 8030, default_direction: 'OUT', requires_document: false, is_active: false, is_postable: false, is_system: true },
  { idSource: 'despesa.asaas', code: 'ASAAS_LEGACY', name: 'Asaas (legado)', kind: 'EXPENSE', parent_code: 'DESPESAS_FINANCEIRAS', sort_order: 8040, default_direction: 'OUT', requires_document: false, is_active: false, is_postable: false, is_system: true },
  { idSource: 'despesa.impostos', code: 'IMPOSTOS_LEGACY', name: 'Impostos (legado)', kind: 'EXPENSE', parent_code: 'DESPESAS_FINANCEIRAS', sort_order: 8050, default_direction: 'OUT', requires_document: false, is_active: false, is_postable: false, is_system: true },
  { idSource: 'publicidade_digital', code: 'PUBLICIDADE_DIGITAL', name: 'Publicidade digital', kind: 'EXPENSE', parent_code: 'MARKETING_E_VENDAS', sort_order: 6020, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'despesa.divulgacao_marketing', code: 'DIVULGACAO_MARKETING', name: 'Divulgação e marketing', kind: 'EXPENSE', parent_code: 'MARKETING_E_VENDAS', sort_order: 6030, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'ajustes_e_deducoes_receita', code: 'AJUSTES_E_DEDUCOES_RECEITA', name: 'Ajustes e deduções de receita', kind: 'ADJUSTMENT', sort_order: 9000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'ajustes_e_deducoes_receita.chargebacks', code: 'CHARGEBACKS_LIQUIDACAO', name: 'Chargebacks liquidação', kind: 'ADJUSTMENT', parent_code: 'AJUSTES_E_DEDUCOES_RECEITA', sort_order: 9010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'aporte', code: 'APORTES', name: 'Aportes', kind: 'CONTRIBUTION', sort_order: 10000, default_direction: 'IN', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'aporte.socio', code: 'APORTE_SOCIO', name: 'Aporte de sócio', kind: 'CONTRIBUTION', parent_code: 'APORTES', sort_order: 10010, default_direction: 'IN', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'retirada', code: 'RETIRADAS', name: 'Retiradas', kind: 'WITHDRAWAL', sort_order: 11000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'retirada.socio', code: 'RETIRADA_SOCIO', name: 'Retirada de sócio', kind: 'WITHDRAWAL', parent_code: 'RETIRADAS', sort_order: 11010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'transferencia', code: 'TRANSFERENCIAS', name: 'Transferências', kind: 'TRANSFER', sort_order: 12000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'transferencia.interna', code: 'TRANSFERENCIA_INTERNA', name: 'Transferência interna', kind: 'TRANSFER', parent_code: 'TRANSFERENCIAS', sort_order: 12010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'passivo', code: 'OBRIGACOES_OPERACIONAIS', name: 'Obrigações operacionais', kind: 'LIABILITY', sort_order: 13000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'passivo.creditos_pre_pagos', code: 'CREDITOS_PRE_PAGOS', name: 'Créditos pré-pagos', kind: 'LIABILITY', parent_code: 'OBRIGACOES_OPERACIONAIS', sort_order: 13010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'passivo.valores_motoristas', code: 'VALORES_MOTORISTAS', name: 'Valores de motoristas', kind: 'LIABILITY', parent_code: 'OBRIGACOES_OPERACIONAIS', sort_order: 13020, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'passivo.valores_gestores', code: 'VALORES_GESTORES', name: 'Valores de gestores', kind: 'LIABILITY', parent_code: 'OBRIGACOES_OPERACIONAIS', sort_order: 13030, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'passivo.valores_comercios', code: 'VALORES_COMERCIOS', name: 'Valores de comércios', kind: 'LIABILITY', parent_code: 'OBRIGACOES_OPERACIONAIS', sort_order: 13040, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'passivo.retencoes', code: 'RETENCOES', name: 'Retenções', kind: 'LIABILITY', parent_code: 'OBRIGACOES_OPERACIONAIS', sort_order: 13050, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'passivo.outros_terceiros', code: 'OUTROS_TERCEIROS', name: 'Outros terceiros', kind: 'LIABILITY', parent_code: 'OBRIGACOES_OPERACIONAIS', sort_order: 13060, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'passivo.bonus_anual_motoristas', code: 'BONUS_ANUAL_MOTORISTAS_A_PAGAR', name: 'Bônus anual de motoristas a pagar', kind: 'LIABILITY', parent_code: 'OBRIGACOES_OPERACIONAIS', sort_order: 13070, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'valores_em_transito', code: 'VALORES_EM_TRANSITO', name: 'Valores em trânsito', kind: 'CLEARING', sort_order: 14000, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: false, is_system: true },
  { idSource: 'valores_em_transito.processador', code: 'VALORES_PROCESSADOR', name: 'Valores processador', kind: 'CLEARING', parent_code: 'VALORES_EM_TRANSITO', sort_order: 14010, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'valores_em_transito.recebiveis', code: 'RECEBIVEIS_LIQUIDAR', name: 'Recebíveis a liquidar', kind: 'CLEARING', parent_code: 'VALORES_EM_TRANSITO', sort_order: 14020, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
  { idSource: 'valores_em_transito.reembolsos_processamento', code: 'REEMBOLSOS_PROCESSAMENTO', name: 'Reembolsos processamento', kind: 'CLEARING', parent_code: 'VALORES_EM_TRANSITO', sort_order: 14030, default_direction: 'OUT', requires_document: false, is_active: true, is_postable: true, is_system: true },
];

export const FINANCE_COST_CENTER_SEEDS: FinanceCostCenterSeed[] = [
  { code: 'kaviar-geral', name: 'KAVIAR Geral', type: 'COMPANY', is_active: true },
  { code: 'tecnologia', name: 'Tecnologia', type: 'DEPARTMENT', parent_code: 'kaviar-geral', is_active: true },
  { code: 'marketing', name: 'Marketing', type: 'DEPARTMENT', parent_code: 'kaviar-geral', is_active: true },
  { code: 'regulatorio', name: 'Regulatório', type: 'DEPARTMENT', parent_code: 'kaviar-geral', is_active: true },
  { code: 'comercial', name: 'Comercial', type: 'DEPARTMENT', parent_code: 'kaviar-geral', is_active: true },
  { code: 'rio-de-janeiro', name: 'Rio de Janeiro', type: 'CITY', parent_code: 'kaviar-geral', territory_code: 'territory-rj-city', city: 'Rio de Janeiro', state: 'RJ', is_active: true },
  { code: 'tambau', name: 'Tambaú', type: 'CITY', parent_code: 'kaviar-geral', city: 'Tambaú', state: 'SP', is_active: true },
  { code: 'santa-rita-do-passa-quatro', name: 'Santa Rita do Passa Quatro', type: 'CITY', parent_code: 'kaviar-geral', city: 'Santa Rita do Passa Quatro', state: 'SP', is_active: true },
];

export const FINANCE_RECOGNITION_POLICY_SEEDS: FinanceRecognitionPolicySeed[] = [
  { code: 'ride_revenue.default', subject: 'RIDE_REVENUE', scope_type: 'GLOBAL', policy: 'UNCLASSIFIED', status: 'DRAFT', reason: 'Seed inicial sem classificação definitiva', notes: 'Política de entrada apenas para base do módulo financeiro.' },
  { code: 'prepaid_driver_credits.default', subject: 'PREPAID_DRIVER_CREDITS', scope_type: 'GLOBAL', policy: 'UNCLASSIFIED', status: 'DRAFT', reason: 'Seed inicial sem classificação definitiva', notes: 'Tratamento posterior como passivo.' },
  { code: 'manager_payments.default', subject: 'MANAGER_PAYMENTS', scope_type: 'GLOBAL', policy: 'UNCLASSIFIED', status: 'DRAFT', reason: 'Seed inicial sem classificação definitiva', notes: 'Pagamentos de gestores permanecem sem classificação definitiva.' },
  { code: 'commercial_payments.default', subject: 'COMMERCIAL_PAYMENTS', scope_type: 'GLOBAL', policy: 'UNCLASSIFIED', status: 'DRAFT', reason: 'Seed inicial sem classificação definitiva', notes: 'Pagamentos comerciais aguardam regra contábil.' },
  { code: 'other.default', subject: 'OTHER', scope_type: 'GLOBAL', policy: 'UNCLASSIFIED', status: 'DRAFT', reason: 'Seed inicial sem classificação definitiva', notes: 'Fallback sem decisão contábil.' },
];

async function seedFinancialFoundation(adminId: string, rioDeJaneiroTerritoryId: string) {
  const categoryByCode = new Map<string, { id: string }>();

  for (const seed of FINANCE_CATEGORY_SEEDS) {
    const parentId = seed.parent_code ? categoryByCode.get(seed.parent_code)?.id ?? null : null;
    const row = await prisma.financial_categories.upsert({
      where: { code: seed.code },
      update: {
        name: seed.name,
        kind: seed.kind,
        parent_id: parentId,
        default_direction: seed.default_direction ?? null,
        requires_document: seed.requires_document ?? false,
        is_system: seed.is_system ?? true,
        is_active: seed.is_active ?? true,
        is_postable: seed.is_postable,
        sort_order: seed.sort_order ?? 0,
        updated_by_admin_id: adminId,
      },
      create: {
        id: financeCategoryId(seed.idSource),
        code: seed.code,
        name: seed.name,
        kind: seed.kind,
        parent_id: parentId,
        default_direction: seed.default_direction ?? null,
        requires_document: seed.requires_document ?? false,
        is_system: seed.is_system ?? true,
        is_active: seed.is_active ?? true,
        is_postable: seed.is_postable,
        sort_order: seed.sort_order ?? 0,
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
      },
    });

    categoryByCode.set(seed.code, { id: row.id });
  }

  const costCenterByCode = new Map<string, { id: string }>();

  for (const seed of FINANCE_COST_CENTER_SEEDS) {
    const parentId = seed.parent_code ? costCenterByCode.get(seed.parent_code)?.id ?? null : null;
    const territoryId = seed.territory_code === 'territory-rj-city' ? rioDeJaneiroTerritoryId : null;
    const row = await prisma.financial_cost_centers.upsert({
      where: { code: seed.code },
      update: {
        name: seed.name,
        type: seed.type,
        parent_id: parentId,
        territory_id: territoryId,
        city: seed.city ?? null,
        state: seed.state ?? null,
        is_active: seed.is_active ?? true,
        updated_by_admin_id: adminId,
      },
      create: {
        code: seed.code,
        name: seed.name,
        type: seed.type,
        parent_id: parentId,
        territory_id: territoryId,
        city: seed.city ?? null,
        state: seed.state ?? null,
        is_active: seed.is_active ?? true,
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
      },
    });

    costCenterByCode.set(seed.code, { id: row.id });
  }

  for (const seed of FINANCE_RECOGNITION_POLICY_SEEDS) {
    await prisma.financial_recognition_policies.upsert({
      where: { code: seed.code },
      update: {
        subject: seed.subject,
        scope_type: seed.scope_type,
        policy: seed.policy,
        status: seed.status,
        effective_from: new Date('2026-01-01T00:00:00.000Z'),
        effective_until: null,
        reason: seed.reason,
        notes: seed.notes ?? null,
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
      },
      create: {
        code: seed.code,
        subject: seed.subject,
        scope_type: seed.scope_type,
        policy: seed.policy,
        status: seed.status,
        effective_from: new Date('2026-01-01T00:00:00.000Z'),
        effective_until: null,
        reason: seed.reason,
        notes: seed.notes ?? null,
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
      },
    });
  }
}

async function main() {
  console.log('🔧 Inicializando dados padrão...');

  // Admin padrão
  const hashedPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.admins.upsert({
    where: { email: 'admin@kaviar.com' },
    update: { password: hashedPassword },
    create: {
      name: 'Admin Kaviar',
      email: 'admin@kaviar.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      is_active: true,
      must_change_password: false,
    },
  });
  console.log('✅ Admin: admin@kaviar.com / admin123');

  // Bairro de teste
  const neighborhood = await prisma.neighborhoods.upsert({
    where: { id: 'bairro-centro-rj' },
    update: {},
    create: {
      id: 'bairro-centro-rj',
      name: 'Centro',
      city: 'Rio de Janeiro',
      area_type: 'BAIRRO_OFICIAL',
      is_active: true,
      updated_at: new Date(),
    },
  });
  console.log('✅ Bairro: Centro - RJ');

  // Comunidade de teste
  await prisma.communities.upsert({
    where: { id: 'comunidade-centro-rj' },
    update: {},
    create: {
      id: 'comunidade-centro-rj',
      name: 'Comunidade Centro RJ',
      is_active: true,
      updated_at: new Date(),
    },
  });
  console.log('✅ Comunidade: Comunidade Centro RJ');

  // Motorista de teste
  const driverPassword = await bcrypt.hash('driver123', 10);
  await prisma.drivers.upsert({
    where: { email: 'motorista@kaviar.com' },
    update: { password_hash: driverPassword },
    create: {
      id: 'driver-test-001',
      name: 'Motorista Teste',
      email: 'motorista@kaviar.com',
      phone: '21999990001',
      password_hash: driverPassword,
      status: 'approved',
      neighborhood_id: neighborhood.id,
      document_cpf: '000.000.000-00',
      vehicle_color: 'Prata',
      vehicle_model: 'Gol 2020',
      vehicle_plate: 'ABC-1234',
      updated_at: new Date(),
    },
  });
  console.log('✅ Motorista: motorista@kaviar.com / driver123 (approved)');

  // Motorista pendente (para testar fluxo de documentos)
  await prisma.drivers.upsert({
    where: { email: 'novo.motorista@kaviar.com' },
    update: { password_hash: driverPassword },
    create: {
      id: 'driver-test-002',
      name: 'Novo Motorista',
      email: 'novo.motorista@kaviar.com',
      phone: '21999990002',
      password_hash: driverPassword,
      status: 'pending',
      neighborhood_id: neighborhood.id,
      document_cpf: '111.111.111-11',
      vehicle_color: 'Branco',
      updated_at: new Date(),
    },
  });
  console.log('✅ Motorista pendente: novo.motorista@kaviar.com / driver123 (pending)');

  // Passageiro de teste (para fluxo de corrida v2)
  const passengerPassword = await bcrypt.hash('pass123', 10);
  await prisma.passengers.upsert({
    where: { email: 'passageiro@kaviar.com' },
    update: { password_hash: passengerPassword },
    create: {
      id: 'passenger-test-001',
      name: 'Passageiro Teste',
      email: 'passageiro@kaviar.com',
      phone: '21999990003',
      password_hash: passengerPassword,
      status: 'ACTIVE',
      updated_at: new Date(),
    },
  });

  // Consent LGPD do passageiro (obrigatório para login)
  await prisma.user_consents.upsert({
    where: { passenger_id_consent_type: { passenger_id: 'passenger-test-001', consent_type: 'LGPD' } },
    update: { accepted: true },
    create: {
      id: 'consent-lgpd-passenger-test-001',
      passenger_id: 'passenger-test-001',
      consent_type: 'LGPD',
      accepted: true,
      accepted_at: new Date(),
      ip_address: '127.0.0.1',
    },
  });
  console.log('✅ Passageiro: passageiro@kaviar.com / pass123 (ACTIVE + LGPD)');

  // Território operacional RJ
  const rjState = await prisma.operational_territories.upsert({
    where: { id: 'territory-rj-state' },
    update: {},
    create: {
      id: 'territory-rj-state',
      name: 'Rio de Janeiro',
      level: 'state',
      center_lat: -22.90685,
      center_lng: -43.1729,
    },
  });
  const rjCity = await prisma.operational_territories.upsert({
    where: { id: 'territory-rj-city' },
    update: {},
    create: {
      id: 'territory-rj-city',
      name: 'Rio de Janeiro',
      level: 'city',
      parent_id: rjState.id,
      center_lat: -22.90685,
      center_lng: -43.1729,
    },
  });
  // Vincular bairro de teste ao território
  await prisma.neighborhoods.update({
    where: { id: 'bairro-centro-rj' },
    data: { territory_id: rjCity.id },
  });
  console.log('✅ Território: RJ (state) → Rio de Janeiro (city)');

  await seedFinancialFoundation(admin.id, rjCity.id);
  console.log('✅ Base financeira 1A: categorias, centros de custo e políticas UNCLASSIFIED');

  // Regras municipais iniciais: Santa Rita do Passa Quatro/SP
  const santaRitaCar = await prisma.municipal_regulations.upsert({
    where: {
      id: 'municipal-reg-santa-rita-sp-car',
    },
    update: {
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requires_protocol: true,
      max_vehicle_age_years: 12,
      vehicle_age_basis: 'MANUFACTURE_YEAR',
      responsible_agency: 'Departamento de Serviços Municipais',
      notes: 'regulamentação municipal para transporte remunerado privado individual de passageiros por aplicativo.',
      is_active: true,
    },
    create: {
      id: 'municipal-reg-santa-rita-sp-car',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'CAR',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      requires_protocol: true,
      max_vehicle_age_years: 12,
      vehicle_age_basis: 'MANUFACTURE_YEAR',
      responsible_agency: 'Departamento de Serviços Municipais',
      notes: 'regulamentação municipal para transporte remunerado privado individual de passageiros por aplicativo.',
      is_active: true,
    },
  });

  await prisma.municipal_regulation_requirements.deleteMany({
    where: { regulation_id: santaRitaCar.id },
  });

  await prisma.municipal_regulation_requirements.createMany({
    data: [
      { regulation_id: santaRitaCar.id, requirement_key: 'CNH_B_EAR', label: 'CNH categoria B ou superior com EAR', document_type: 'CNH', is_required: true, sort_order: 1 },
      { regulation_id: santaRitaCar.id, requirement_key: 'BACKGROUND_CHECK', label: 'Certidão negativa de antecedentes criminais', document_type: 'BACKGROUND_CHECK', is_required: true, sort_order: 2 },
      { regulation_id: santaRitaCar.id, requirement_key: 'INSS_MEI', label: 'INSS contribuinte individual ou MEI', document_type: 'INSS_OR_MEI_PROOF', is_required: true, sort_order: 3 },
      { regulation_id: santaRitaCar.id, requirement_key: 'SEGURO_APP', label: 'Seguro APP', document_type: 'APP_INSURANCE', is_required: true, sort_order: 4 },
      { regulation_id: santaRitaCar.id, requirement_key: 'DPVAT', label: 'DPVAT/seguro obrigatório, conforme exigência vigente', document_type: 'MANDATORY_INSURANCE', is_required: true, sort_order: 5 },
      { regulation_id: santaRitaCar.id, requirement_key: 'CRLV', label: 'CRLV regular', document_type: 'CRLV', is_required: true, sort_order: 6 },
      { regulation_id: santaRitaCar.id, requirement_key: 'VEHICLE_AUTHORIZATION', label: 'Contrato de arrendamento/locação/comodato se veículo não estiver no nome do condutor', document_type: 'VEHICLE_AUTHORIZATION_CONTRACT', is_required: true, sort_order: 7 },
      { regulation_id: santaRitaCar.id, requirement_key: 'PROOF_OF_ADDRESS_90_DAYS', label: 'Comprovante de residência expedido nos últimos 90 dias', document_type: 'PROOF_OF_ADDRESS', is_required: true, sort_order: 8 },
      { regulation_id: santaRitaCar.id, requirement_key: 'PHOTO_3X4', label: '2 fotos 3x4 ou foto padrão documento', document_type: 'PROFILE_PHOTO', is_required: true, sort_order: 9 },
      { regulation_id: santaRitaCar.id, requirement_key: 'MUNICIPAL_REGISTRATION', label: 'Inscrição junto à Divisão de Arrecadação Municipal', document_type: 'MUNICIPAL_REGISTRATION', is_required: true, sort_order: 10 },
      { regulation_id: santaRitaCar.id, requirement_key: 'MUNICIPAL_DEBT_CLEARANCE', label: 'Certidão negativa de débitos municipais', document_type: 'MUNICIPAL_DEBT_CLEARANCE', is_required: true, sort_order: 11 },
      { regulation_id: santaRitaCar.id, requirement_key: 'MUNICIPAL_TAX_PAYMENT', label: 'Comprovante de recolhimento de tributos municipais, quando aplicável', document_type: 'MUNICIPAL_TAX_PAYMENT_PROOF', is_required: false, sort_order: 12 },
      { regulation_id: santaRitaCar.id, requirement_key: 'VEHICLE_GOOD_CONDITION_DECLARATION', label: 'Declaração de veículo em bom estado de conservação, funcionamento, segurança, higiene e limpeza', document_type: 'VEHICLE_CONDITION_DECLARATION', is_required: true, sort_order: 13 },
      { regulation_id: santaRitaCar.id, requirement_key: 'MAX_VEHICLE_AGE_12', label: 'Validação de veículo com no máximo 12 anos de fabricação', document_type: 'VEHICLE_YEAR_VALIDATION', is_required: true, sort_order: 14 },
    ],
  });

  await prisma.municipal_regulations.upsert({
    where: {
      id: 'municipal-reg-santa-rita-sp-moto-passenger',
    },
    update: {
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'MOTO_PASSENGER',
      regulation_status: 'REQUIRES_CONFIRMATION',
      requires_city_approval: true,
      requires_protocol: true,
      responsible_agency: 'Departamento de Serviços Municipais',
      notes: 'Modalidade de moto passageiro requer confirmação formal da Prefeitura antes de habilitar operação.',
      is_active: true,
    },
    create: {
      id: 'municipal-reg-santa-rita-sp-moto-passenger',
      city: 'Santa Rita do Passa Quatro',
      state: 'SP',
      service_modality: 'MOTO_PASSENGER',
      regulation_status: 'REQUIRES_CONFIRMATION',
      requires_city_approval: true,
      requires_protocol: true,
      responsible_agency: 'Departamento de Serviços Municipais',
      notes: 'Modalidade de moto passageiro requer confirmação formal da Prefeitura antes de habilitar operação.',
      is_active: true,
    },
  });

  console.log('✅ Regras municipais: Santa Rita do Passa Quatro/SP (CAR regulado + MOTO_PASSENGER requer confirmação)');

  console.log('\n🎉 Seed completo!');
}

if (process.argv[1] && process.argv[1].includes('/prisma/seed.ts')) {
  main()
    .catch((e) => {
      console.error('❌ Erro:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { seedFinancialFoundation };
