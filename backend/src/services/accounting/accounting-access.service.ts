/**
 * Central authorization helper for Portal do Contador.
 *
 * Validates: accountant → active link → entity → scope → permission.
 *
 * Rules:
 * - COMPLETO scope always satisfies any required scope.
 * - Permissions (can_view, can_upload, etc.) are checked independently of scope.
 * - Returns the link if authorized; throws AccessDeniedError if not.
 */

import { verifyEntityAccess } from './accounting-documents.service';

// ── Types ────────────────────────────────────────────────────────────────

export type AccountingScope =
  | 'FISCAL'
  | 'CONTABIL'
  | 'FOLHA'
  | 'SOCIETARIO'
  | 'FINANCEIRO'
  | 'MUNICIPAL'
  | 'COMPLETO';

export type AccountingPermission =
  | 'can_view'
  | 'can_upload'
  | 'can_download'
  | 'can_request_correction'
  | 'can_mark_processed'
  | 'can_close_period';

export interface AccessRequirement {
  /** Required scope(s). If array, ANY of the listed scopes satisfies. */
  scope?: AccountingScope | AccountingScope[];
  /** Required permission(s). ALL listed permissions must be true. */
  permission?: AccountingPermission | AccountingPermission[];
}

export class AccessDeniedError extends Error {
  public readonly statusCode = 403;
  constructor(message = 'Acesso negado') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export class EntityNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message = 'Recurso não encontrado') {
    super(message);
    this.name = 'EntityNotFoundError';
  }
}

// ── Mapping: document category → required scope ──────────────────────────

const DOCUMENT_CATEGORY_TO_SCOPE: Record<string, AccountingScope> = {
  FISCAL: 'FISCAL',
  SOCIETARIO: 'SOCIETARIO',
  TRABALHISTA: 'FOLHA',
  CERTIFICADO: 'SOCIETARIO',
  PROCURACAO: 'SOCIETARIO',
  LICENCA: 'MUNICIPAL',
  INSCRICAO: 'FISCAL',
  OUTRO: 'CONTABIL', // fallback — COMPLETO always passes anyway
};

export function scopeForDocumentCategory(category: string | null | undefined): AccountingScope | undefined {
  if (!category) return undefined;
  return DOCUMENT_CATEGORY_TO_SCOPE[category];
}

// ── Core validation ──────────────────────────────────────────────────────

/**
 * Check if a link's scope satisfies the required scope.
 */
function scopeSatisfied(linkScope: string, required: AccountingScope | AccountingScope[]): boolean {
  // COMPLETO always satisfies any scope
  if (linkScope === 'COMPLETO') return true;

  const requiredArr = Array.isArray(required) ? required : [required];
  return requiredArr.includes(linkScope as AccountingScope);
}

/**
 * Check if all required permissions are granted.
 */
function permissionsSatisfied(link: any, required: AccountingPermission | AccountingPermission[]): boolean {
  const requiredArr = Array.isArray(required) ? required : [required];
  return requiredArr.every(perm => link[perm] === true);
}

/**
 * Main authorization function.
 *
 * Usage:
 *   const link = await requireAccountingAccess(accountantId, entityId, { scope: 'FINANCEIRO', permission: 'can_view' });
 *
 * Throws AccessDeniedError (403) or EntityNotFoundError (404).
 * Returns the full link object on success.
 */
export async function requireAccountingAccess(
  accountantId: string,
  legalEntityId: string,
  requirement?: AccessRequirement,
): Promise<any> {
  // 1. Verify active link exists (includes status, dates, parent inheritance)
  const link = await verifyEntityAccess(accountantId, legalEntityId);
  if (!link) {
    throw new EntityNotFoundError();
  }

  // 2. Check scope if required
  if (requirement?.scope) {
    if (!scopeSatisfied(link.scope, requirement.scope)) {
      throw new AccessDeniedError('Escopo insuficiente para esta operação');
    }
  }

  // 3. Check permissions if required
  if (requirement?.permission) {
    if (!permissionsSatisfied(link, requirement.permission)) {
      throw new AccessDeniedError('Permissão insuficiente para esta operação');
    }
  }

  return link;
}

/**
 * Express-friendly error handler. Call in catch blocks.
 * Returns true if error was handled (response sent), false otherwise.
 */
export function handleAccessError(err: unknown, res: any): boolean {
  if (err instanceof AccessDeniedError) {
    res.status(403).json({ success: false, error: err.message });
    return true;
  }
  if (err instanceof EntityNotFoundError) {
    res.status(404).json({ success: false, error: err.message });
    return true;
  }
  return false;
}
