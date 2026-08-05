export const ORDER_HISTORY_PAYMENT_STATUSES = [
  "paid",
  "review_required",
  "refunded",
] as const;

export const ORDER_HISTORY_POSTGREST_FILTER =
  `test_mode.eq.true,payment_status.in.(${ORDER_HISTORY_PAYMENT_STATUSES.join(",")})`;

export function isOrderVisibleInHistory(
  paymentStatus: string,
  testMode: boolean,
) {
  return testMode || ORDER_HISTORY_PAYMENT_STATUSES.includes(
    paymentStatus as (typeof ORDER_HISTORY_PAYMENT_STATUSES)[number],
  );
}
