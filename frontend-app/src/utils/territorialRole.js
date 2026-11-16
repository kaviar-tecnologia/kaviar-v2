export function resolveTerritorialRole(role, roleType) {
  return role || (roleType === 'manager' ? 'TERRITORIAL_MANAGER' : 'TERRITORIAL_OPERATOR');
}
