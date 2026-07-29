export const HOOMA_PLUS_PLANS = {
  monthly: {
    code: "monthly",
    priceMinor: 3_500,
    durationMonths: 1,
  },
  annual: {
    code: "annual",
    priceMinor: 35_000,
    durationMonths: 12,
  },
} as const;

export type HoomaPlusPlanCode = keyof typeof HOOMA_PLUS_PLANS;

export const DELIVERY_POLICY = {
  version: "2026-07-29",
  standardFeeMinor: 500,
  freeAboveSubtotalMinor: 10_000,
  welcomeUnits: 10,
} as const;

export type DeliveryBenefitCode =
  | "hooma_plus"
  | "subtotal_threshold"
  | "welcome_units"
  | "standard_fee"
  | "legacy_free";

export type HoomaPlusSummary = {
  active: boolean;
  activeUntil: string | null;
  welcomeUnitsTotal: number;
  welcomeUnitsConsumed: number;
  welcomeUnitsReserved: number;
  welcomeUnitsRemaining: number;
};

export type DeliveryQuote = {
  subtotalMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  benefitCode: DeliveryBenefitCode;
  welcomeUnitsToReserve: number;
  welcomeUnitsRemainingAfterPayment: number;
  amountUntilFreeDeliveryMinor: number;
};

const safeInteger = (value: unknown, fallback = 0) =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;

export function parseHoomaPlusSummary(value: unknown): HoomaPlusSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.active !== "boolean") return null;
  const activeUntil = typeof source.active_until === "string" ? source.active_until : null;
  return {
    active: source.active,
    activeUntil,
    welcomeUnitsTotal: safeInteger(source.welcome_units_total, DELIVERY_POLICY.welcomeUnits),
    welcomeUnitsConsumed: safeInteger(source.welcome_units_consumed),
    welcomeUnitsReserved: safeInteger(source.welcome_units_reserved),
    welcomeUnitsRemaining: safeInteger(source.welcome_units_remaining),
  };
}

export function quoteCatalogDelivery(input: {
  subtotalMinor: number;
  unitCount: number;
  summary: HoomaPlusSummary;
}): DeliveryQuote {
  const subtotalMinor = safeInteger(input.subtotalMinor);
  const unitCount = safeInteger(input.unitCount);
  const remaining = safeInteger(input.summary.welcomeUnitsRemaining);
  let deliveryMinor: number = DELIVERY_POLICY.standardFeeMinor;
  let benefitCode: DeliveryBenefitCode = "standard_fee";
  let welcomeUnitsToReserve = 0;

  if (input.summary.active) {
    deliveryMinor = 0;
    benefitCode = "hooma_plus";
  } else if (subtotalMinor > DELIVERY_POLICY.freeAboveSubtotalMinor) {
    deliveryMinor = 0;
    benefitCode = "subtotal_threshold";
  } else if (unitCount > 0 && unitCount <= remaining) {
    deliveryMinor = 0;
    benefitCode = "welcome_units";
    welcomeUnitsToReserve = unitCount;
  }

  return {
    subtotalMinor,
    deliveryMinor,
    totalMinor: subtotalMinor + deliveryMinor,
    benefitCode,
    welcomeUnitsToReserve,
    welcomeUnitsRemainingAfterPayment: Math.max(0, remaining - welcomeUnitsToReserve),
    amountUntilFreeDeliveryMinor: subtotalMinor > DELIVERY_POLICY.freeAboveSubtotalMinor
      ? 0
      : DELIVERY_POLICY.freeAboveSubtotalMinor + 1 - subtotalMinor,
  };
}

export function isHoomaPlusPlanCode(value: unknown): value is HoomaPlusPlanCode {
  return value === "monthly" || value === "annual";
}
