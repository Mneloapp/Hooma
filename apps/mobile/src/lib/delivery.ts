export const DELIVERY_POLICY = {
  standardFeeMinor: 500,
  freeThresholdMinor: 10_000,
  welcomeUnits: 10,
} as const;

export type DeliverySummary = {
  active: boolean;
  welcomeUnitsRemaining: number;
};

export function quoteDeliveryPreview(input: {
  subtotalMinor: number;
  unitCount: number;
  summary?: DeliverySummary | null;
}) {
  const { subtotalMinor, unitCount, summary } = input;
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new Error("invalid_subtotal");
  if (!Number.isInteger(unitCount) || unitCount < 0) throw new Error("invalid_unit_count");
  if (summary?.active) return { deliveryMinor: 0, benefitCode: "hooma_plus" as const };
  if (subtotalMinor >= DELIVERY_POLICY.freeThresholdMinor) {
    return { deliveryMinor: 0, benefitCode: "subtotal_threshold" as const };
  }
  if (
    unitCount > 0
    && Number.isInteger(summary?.welcomeUnitsRemaining)
    && unitCount <= (summary?.welcomeUnitsRemaining ?? 0)
  ) {
    return { deliveryMinor: 0, benefitCode: "welcome_units" as const };
  }
  return { deliveryMinor: DELIVERY_POLICY.standardFeeMinor, benefitCode: "standard_fee" as const };
}
