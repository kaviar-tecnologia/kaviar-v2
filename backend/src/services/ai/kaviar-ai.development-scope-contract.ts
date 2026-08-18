export const MAX_DEVELOPMENT_ALLOWED_PATHS = 20;

export class DevelopmentScopeContractError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DevelopmentScopeContractError';
  }
}

export function normalizeDevelopmentAllowedPaths(
  input: unknown,
): string[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAX_DEVELOPMENT_ALLOWED_PATHS
  ) {
    throw new DevelopmentScopeContractError(
      'DEVELOPMENT_JOB_INVALID_SCOPE',
      `Escopo deve conter entre 1 e ${MAX_DEVELOPMENT_ALLOWED_PATHS} caminhos.`,
    );
  }

  const normalized = input.map((value) => {
    if (typeof value !== 'string') {
      throw new DevelopmentScopeContractError(
        'DEVELOPMENT_JOB_INVALID_SCOPE',
        'Todos os caminhos do escopo devem ser strings.',
      );
    }

    const path = value.trim();

    if (
      !path ||
      path.startsWith('/') ||
      path === '.' ||
      path === '..' ||
      path.startsWith('../') ||
      path.includes('/../') ||
      path.endsWith('/..') ||
      path === '.git' ||
      path.startsWith('.git/')
    ) {
      throw new DevelopmentScopeContractError(
        'DEVELOPMENT_JOB_INVALID_SCOPE',
        'Escopo contém caminho não permitido.',
      );
    }

    return path;
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new DevelopmentScopeContractError(
      'DEVELOPMENT_JOB_INVALID_SCOPE',
      'Escopo contém caminhos duplicados.',
    );
  }

  return normalized;
}
