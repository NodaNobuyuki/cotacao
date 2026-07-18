import { latest, quoteAsOf } from "./series";
import type { Quote, Series } from "./types";

/**
 * "What if I had sold on date X?" — the hypothetical proceeds of a past sale
 * against the same sale at the latest quote.
 *
 * The sell date resolves through `quoteAsOf`, so a date that fell on a weekend
 * or holiday uses the last quote published on or before it — the same
 * gap-aware rule the variations use. `sold.date` carries the date actually
 * used, and the UI shows it when it differs from what the user asked for.
 */
export interface SaleBacktest {
  readonly sold: Quote;
  readonly current: Quote;
  readonly quantity: number;
  readonly proceedsThen: number;
  readonly proceedsNow: number;
  /** Price movement from the sale date to the latest quote. */
  readonly changePct: number | undefined;
}

export function backtestSale(
  series: Series,
  sellDate: string,
  quantity: number,
): SaleBacktest | undefined {
  if (!(quantity > 0)) return undefined;

  const current = latest(series);
  if (!current) return undefined;

  // A date before the first quote has no answer; inventing one by clamping
  // forward would silently price the sale on a day the user did not pick.
  const sold = quoteAsOf(series, sellDate);
  if (!sold) return undefined;

  return {
    sold,
    current,
    quantity,
    proceedsThen: sold.price * quantity,
    proceedsNow: current.price * quantity,
    changePct: sold.price === 0 ? undefined : (current.price / sold.price - 1) * 100,
  };
}
