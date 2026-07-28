/**
 * Account Ownership Preflight.
 *
 * Before any real payment can be executed, verifies that the Asaas account:
 * - Is Pessoa Jurídica (JURIDICA)
 * - Has CNPJ 67.783.601/0001-99
 * - Has APPROVED general status
 * - Has transfer capability AVAILABLE
 *
 * Both the manual flag AND the real API check must pass simultaneously.
 * The flag alone cannot substitute the real verification.
 */

import { AccountOwnershipCheck, OUTBOUND_PAYMENT_ERRORS } from './types';

const EXPECTED_PERSON_TYPE = 'JURIDICA';
const EXPECTED_CNPJ = '67783601000199';

export interface AccountStatusResponse {
  personType?: string;
  cpfCnpj?: string;
  generalStatus?: string;
  commercialInfoStatus?: string;
  transfersEnabled?: boolean;
}

/**
 * Validates account ownership for production operations.
 *
 * Requires simultaneously:
 * 1. ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED === "true"
 * 2. API response confirming PJ + CNPJ + APPROVED + transfers enabled
 */
export function validateAccountOwnership(
  apiResponse: AccountStatusResponse | null,
): AccountOwnershipCheck {
  // 1. Check manual flag
  const flagConfirmed = process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED === 'true';

  if (!flagConfirmed) {
    return {
      passed: false,
      failureReason: 'ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED is not "true"',
    };
  }

  // 2. Check expected config vars
  const expectedPersonType = process.env.ASAAS_ACCOUNT_EXPECTED_PERSON_TYPE ?? EXPECTED_PERSON_TYPE;
  const expectedCnpj = process.env.ASAAS_ACCOUNT_EXPECTED_CNPJ ?? EXPECTED_CNPJ;

  // 3. Validate API response
  if (!apiResponse) {
    return {
      passed: false,
      failureReason: 'Could not retrieve account status from provider',
    };
  }

  const normalizedCnpj = (apiResponse.cpfCnpj ?? '').replace(/\D/g, '');

  if (apiResponse.personType !== expectedPersonType) {
    return {
      passed: false,
      personType: apiResponse.personType,
      failureReason: `Account personType is "${apiResponse.personType}", expected "${expectedPersonType}"`,
    };
  }

  if (normalizedCnpj !== expectedCnpj) {
    return {
      passed: false,
      cpfCnpj: '***masked***',
      failureReason: OUTBOUND_PAYMENT_ERRORS.ACCOUNT_OWNERSHIP_MISMATCH,
    };
  }

  if (apiResponse.generalStatus !== 'APPROVED') {
    return {
      passed: false,
      generalStatus: apiResponse.generalStatus,
      failureReason: `Account general status is "${apiResponse.generalStatus}", expected "APPROVED"`,
    };
  }

  if (apiResponse.transfersEnabled !== true) {
    return {
      passed: false,
      transferCapability: 'NOT_AVAILABLE',
      failureReason: 'Transfer capability not available on account',
    };
  }

  return {
    passed: true,
    personType: apiResponse.personType,
    generalStatus: apiResponse.generalStatus,
    transferCapability: 'AVAILABLE',
  };
}

/**
 * Quick check: is outbound payment globally enabled?
 */
export function isOutboundPaymentsEnabled(): boolean {
  return process.env.OUTBOUND_PAYMENTS_ENABLED === 'true';
}

/**
 * Check if a specific payment purpose is enabled.
 */
export function isPurposeEnabled(purpose: string): boolean {
  const flagMap: Record<string, string> = {
    DRIVER_ANNUAL_INCENTIVE: 'DRIVER_ANNUAL_INCENTIVE_ENABLED',
    MANAGER_TERRITORIAL_COMMISSION: 'MANAGER_TERRITORIAL_COMMISSION_ENABLED',
    ACCOUNTING_SERVICE: 'ACCOUNTING_SERVICE_PAYMENT_ENABLED',
    SUPPLIER_INVOICE: 'SUPPLIER_PAYMENT_ENABLED',
    SERVICE_PROVIDER: 'SUPPLIER_PAYMENT_ENABLED',
    OPERATIONAL_EXPENSE: 'SUPPLIER_PAYMENT_ENABLED',
    EMPLOYEE_OR_CONTRACTOR_REIMBURSEMENT: 'SUPPLIER_PAYMENT_ENABLED',
    TAX_OR_GOVERNMENT_PAYMENT: 'BILL_PAYMENT_ENABLED',
    UTILITY_BILL: 'BILL_PAYMENT_ENABLED',
    OTHER_APPROVED_BUSINESS_EXPENSE: 'SUPPLIER_PAYMENT_ENABLED',
  };

  const flagName = flagMap[purpose];
  if (!flagName) return false;
  return process.env[flagName] === 'true';
}
