/**
 * RawCostValue — Internal-only cost representation.
 * DDD-004: NEVER exported outside CostOps. Only CostReference leaves this boundary.
 *
 * ADR-007: "Raw cost values never leave CostOps."
 * This type is deliberately NOT exported from src/cost/index.ts or src/index.ts.
 */

export type CurrencyCode = 'USD' | 'TOKEN';

export interface CostLineItem {
  readonly category: string;
  readonly amount: number;
  readonly unit: string;
}

export interface RawCostValue {
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly breakdown: readonly CostLineItem[];
  readonly model_version: string;
}

export function createRawCostValue(
  amount: number,
  currency: CurrencyCode,
  breakdown: readonly CostLineItem[],
  model_version: string,
): RawCostValue {
  return Object.freeze({
    amount,
    currency,
    breakdown: Object.freeze([...breakdown]),
    model_version,
  });
}
