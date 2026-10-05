import { CARE_UNAVAILABLE_CODE } from './care-readiness-policy';
import {
  evaluateAndWriteCareEligibilityShadowAuditTx,
  type CareEligibilityShadowAuditCallerClient,
  type CareEligibilityShadowAuditCallerInput,
  type CareEligibilityShadowDecision,
} from './care-eligibility-shadow-mode';

export const CARE_SHADOW_AUDIT_HARNESS_VERSION = 'care-shadow-audit-harness-v1' as const;
export const CARE_SHADOW_AUDIT_HARNESS_REASON = 'CARE_SHADOW_AUDIT_HARNESS' as const;

export type CareShadowAuditHarnessClient = CareEligibilityShadowAuditCallerClient;

export interface CareShadowAuditHarnessInput extends CareEligibilityShadowAuditCallerInput {
  reason?: string;
}

export interface CareShadowAuditHarnessResult {
  version: typeof CARE_SHADOW_AUDIT_HARNESS_VERSION;
  harnessOnly: true;
  auditWritten: true;
  decision: CareEligibilityShadowDecision;
  operationAllowed: false;
  dispatchAllowed: false;
  acceptanceAllowed: false;
  walletAllowed: false;
  publicCode: typeof CARE_UNAVAILABLE_CODE;
}

const normalizeHarnessReason = (value: unknown): string => {
  if (typeof value !== 'string') return CARE_SHADOW_AUDIT_HARNESS_REASON;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : CARE_SHADOW_AUDIT_HARNESS_REASON;
};

/**
 * CARE-500: internal read-only harness for CARE shadow audit traces.
 *
 * This helper exists only to compose the CARE-499 caller behind a named,
 * explicit internal harness. It is not wired to public routes, dispatcher,
 * offer acceptance, pricing, wallet, mobile apps, migrations, production
 * release flags or deploy workflows.
 *
 * It intentionally returns operational permissions as false even after a
 * successful shadow audit write.
 */
export async function runCareShadowAuditHarnessTx(
  tx: CareShadowAuditHarnessClient,
  input: CareShadowAuditHarnessInput,
  env: Record<string, string | undefined> = process.env,
): Promise<CareShadowAuditHarnessResult> {
  const result = await evaluateAndWriteCareEligibilityShadowAuditTx(
    tx,
    {
      ...input,
      reason: normalizeHarnessReason(input.reason),
    },
    env,
  );

  return {
    version: CARE_SHADOW_AUDIT_HARNESS_VERSION,
    harnessOnly: true,
    auditWritten: result.auditWritten,
    decision: result.decision,
    operationAllowed: false,
    dispatchAllowed: false,
    acceptanceAllowed: false,
    walletAllowed: false,
    publicCode: CARE_UNAVAILABLE_CODE,
  };
}
