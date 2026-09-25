export const AR_PLACES_ALLOWED_ROLES = ['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'];
export const AR_PLACES_DASHBOARD_CARD = {
  title: 'KAVIAR AR — Locais',
  desc: 'Acessar locais AR, incluindo hotéis, comércios, turismo, CARE, Pet, aeroportos e representações KAVIAR.',
  to: '/admin/ar-places',
};

const SUPER_ADMIN_TRANSITIONS = {
  DRAFT: [{ nextStatus: 'SUBMITTED', label: 'Enviar para análise' }],
  SUBMITTED: [
    { nextStatus: 'APPROVED', label: 'Aprovar' },
    { nextStatus: 'REJECTED', label: 'Rejeitar' },
  ],
  APPROVED: [{ nextStatus: 'INACTIVE', label: 'Desativar' }],
  REJECTED: [{ nextStatus: 'DRAFT', label: 'Voltar para rascunho' }],
  INACTIVE: [{ nextStatus: 'APPROVED', label: 'Reativar' }],
};

const MANAGER_TRANSITIONS = {
  DRAFT: [{ nextStatus: 'SUBMITTED', label: 'Enviar para análise' }],
  SUBMITTED: [],
  APPROVED: [],
  REJECTED: [],
  INACTIVE: [],
};

export function canAccessArPlaces(role) {
  return AR_PLACES_ALLOWED_ROLES.includes(role);
}

export function canEditArPlaces(role) {
  return role === 'SUPER_ADMIN' || role === 'TERRITORIAL_MANAGER';
}

export function getAllowedArPlaceTransitions(role, currentStatus) {
  if (role === 'SUPER_ADMIN') return SUPER_ADMIN_TRANSITIONS[currentStatus] || [];
  if (role === 'TERRITORIAL_MANAGER') return MANAGER_TRANSITIONS[currentStatus] || [];
  return [];
}
