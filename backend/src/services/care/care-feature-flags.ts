/**
 * CARE official feature flags.
 *
 * These flags document and centralize rollout intent only.
 * They must not bypass CARE containment until the official transactional flow
 * is explicitly implemented, tested and reviewed.
 */

export const CARE_OFFICIAL_FLAG_KEYS = [
  'CARE_ADMIN_ENABLED',
  'CARE_PUBLIC_REQUEST_ENABLED',
  'CARE_OFFICIAL_ENABLED',
  'CARE_DISPATCH_ENABLED',
  'CARE_DRIVER_ACCEPTANCE_ENABLED',
  'CARE_AUDIT_STRICT_ENABLED',
] as const;

export type CareOfficialFlagKey = typeof CARE_OFFICIAL_FLAG_KEYS[number];

export type CareOfficialFlagState = Record<CareOfficialFlagKey, boolean>;

export const CARE_OFFICIAL_FLAG_DEFAULTS: CareOfficialFlagState = {
  CARE_ADMIN_ENABLED: false,
  CARE_PUBLIC_REQUEST_ENABLED: false,
  CARE_OFFICIAL_ENABLED: false,
  CARE_DISPATCH_ENABLED: false,
  CARE_DRIVER_ACCEPTANCE_ENABLED: false,
  CARE_AUDIT_STRICT_ENABLED: true,
};

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

export function parseCareBooleanFlag(value: unknown, fallback = false): boolean {
  if (typeof value !== 'string') return fallback;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export function readCareOfficialFlags(
  env: Record<string, string | undefined> = process.env,
): CareOfficialFlagState {
  return {
    CARE_ADMIN_ENABLED: parseCareBooleanFlag(
      env.CARE_ADMIN_ENABLED,
      CARE_OFFICIAL_FLAG_DEFAULTS.CARE_ADMIN_ENABLED,
    ),
    CARE_PUBLIC_REQUEST_ENABLED: parseCareBooleanFlag(
      env.CARE_PUBLIC_REQUEST_ENABLED,
      CARE_OFFICIAL_FLAG_DEFAULTS.CARE_PUBLIC_REQUEST_ENABLED,
    ),
    CARE_OFFICIAL_ENABLED: parseCareBooleanFlag(
      env.CARE_OFFICIAL_ENABLED,
      CARE_OFFICIAL_FLAG_DEFAULTS.CARE_OFFICIAL_ENABLED,
    ),
    CARE_DISPATCH_ENABLED: parseCareBooleanFlag(
      env.CARE_DISPATCH_ENABLED,
      CARE_OFFICIAL_FLAG_DEFAULTS.CARE_DISPATCH_ENABLED,
    ),
    CARE_DRIVER_ACCEPTANCE_ENABLED: parseCareBooleanFlag(
      env.CARE_DRIVER_ACCEPTANCE_ENABLED,
      CARE_OFFICIAL_FLAG_DEFAULTS.CARE_DRIVER_ACCEPTANCE_ENABLED,
    ),
    CARE_AUDIT_STRICT_ENABLED: parseCareBooleanFlag(
      env.CARE_AUDIT_STRICT_ENABLED,
      CARE_OFFICIAL_FLAG_DEFAULTS.CARE_AUDIT_STRICT_ENABLED,
    ),
  };
}

export function areCareOfficialReleaseFlagsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flags = readCareOfficialFlags(env);

  return flags.CARE_PUBLIC_REQUEST_ENABLED
    && flags.CARE_OFFICIAL_ENABLED
    && flags.CARE_DISPATCH_ENABLED
    && flags.CARE_DRIVER_ACCEPTANCE_ENABLED
    && flags.CARE_AUDIT_STRICT_ENABLED;
}
