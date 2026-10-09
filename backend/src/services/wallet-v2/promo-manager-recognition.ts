import { applyBasisPoints } from '../finance/territory/monetary';
import { assertPromoSettlementAmounts } from './promo-settlement-invariants';

export interface PromoManagerRecognition {
  feeAmountCents: bigint;
  collectedCents: bigint;
  subsidizedCents: bigint;
  pendingCents: bigint;
  managerShareCents: bigint;
  managerRecognizedCents: bigint;
  managerPendingCents: bigint;
  kaviarShareCents: bigint;
  kaviarCashAfterManagerCents: bigint;
}

export function calculatePromoManagerRecognition(
  feeAmountCents: bigint,
  collectedCents: bigint,
  subsidizedCents: bigint,
  pendingCents: bigint,
  managerCommissionRateBps: number
): PromoManagerRecognition {
  if (
    !Number.isInteger(managerCommissionRateBps) ||
    managerCommissionRateBps < 0 ||
    managerCommissionRateBps > 10000
  ) {
    throw new Error('PROMO_MANAGER_INVALID_RATE');
  }

  assertPromoSettlementAmounts({
    feeAmountCents,
    collectedCents,
    subsidizedCents,
    pendingCents,
  });

  // Regra contratual: comissão sobre a taxa integral.
  // O bônus de boas-vindas é custeado pela KAVIAR.
  const managerShareCents = applyBasisPoints(
    feeAmountCents,
    managerCommissionRateBps
  );

  // Reconhecimento proporcional à taxa já coberta por
  // dinheiro e/ou pelo subsídio assumido pela KAVIAR.
  const managerRecognizedCents = applyBasisPoints(
    feeAmountCents - pendingCents,
    managerCommissionRateBps
  );

  // Diferença exata para a comissão contratual integral.
  const managerPendingCents =
    managerShareCents - managerRecognizedCents;

  return {
    feeAmountCents,
    collectedCents,
    subsidizedCents,
    pendingCents,
    managerShareCents,
    managerRecognizedCents,
    managerPendingCents,
    kaviarShareCents: feeAmountCents - managerShareCents,

    // Indicador de caixa, não representa arrecadação adicional.
    kaviarCashAfterManagerCents:
      collectedCents - managerShareCents,
  };
}
