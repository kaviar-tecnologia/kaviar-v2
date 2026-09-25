import { ar_place_type } from '@prisma/client';

export type ArPlaceAiRules = {
  grounding_rule: string | null;
  boundary_rule: string | null;
};

const DEFAULT_AR_PLACE_AI_RULES: Partial<Record<ar_place_type, ArPlaceAiRules>> = {
  HOTEL: {
    grounding_rule:
      'Use somente informações cadastradas e aprovadas para o hotel. Não invente horários, serviços, preços, disponibilidade, promoções ou políticas.',
    boundary_rule:
      'Não confirme reservas, não garanta disponibilidade, não invente preços, não se apresente como recepção oficial e não afirme serviços que não estejam cadastrados.',
  },
  KAVIAR_POINT: {
    grounding_rule:
      'Use somente informações oficiais cadastradas e aprovadas pela KAVIAR sobre esta representação local, seus contatos, endereço, território e serviços de apoio.',
    boundary_rule:
      'Não apresente o local como filial, sede, estabelecimento licenciado ou unidade municipalmente autorizada sem que isso esteja expressamente cadastrado e aprovado pela KAVIAR.',
  },
};

export function getDefaultAiRulesForArPlaceType(type: ar_place_type): ArPlaceAiRules | null {
  return DEFAULT_AR_PLACE_AI_RULES[type] || null;
}
