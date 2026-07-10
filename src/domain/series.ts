import type { Quote, Series } from "./types";

/** Days are compared as strings; ISO "YYYY-MM-DD" sorts chronologically. */
export function shiftIsoDays(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function latest(series: Series): Quote | undefined {
  return series.at(-1);
}

/**
 * The last quote published on or before `iso`.
 *
 * This is the operation that makes gap-aware maths possible: asking for
 * "30 days ago" on a market that was closed that day yields the most recent
 * prior trading day rather than nothing.
 *
 * Binary search; `series` must be ascending by date.
 */
export function quoteAsOf(series: Series, iso: string): Quote | undefined {
  let lo = 0;
  let hi = series.length - 1;
  let found: Quote | undefined;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const q = series[mid]!;
    if (q.date <= iso) {
      found = q;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The trailing window covering `calendarDays` back from the last quote. */
export function windowByCalendarDays(
  series: Series,
  calendarDays: number,
): Series {
  const last = latest(series);
  if (!last) return [];
  const cutoff = shiftIsoDays(last.date, -calendarDays);
  const from = series.findIndex((q) => q.date >= cutoff);
  return from === -1 ? [] : series.slice(from);
}

export function priceRange(
  series: Series,
): { min: number; max: number } | undefined {
  if (series.length === 0) return undefined;
  let min = Infinity;
  let max = -Infinity;
  for (const q of series) {
    if (q.price < min) min = q.price;
    if (q.price > max) max = q.price;
  }
  return { min, max };
}

/**
 * Re-expresses a series as percent change from its first point, so crops with
 * very different absolute prices (café at ~R$1850, milho at ~R$62) can share
 * one y-axis.
 */
export function rebaseToPercent(series: Series): number[] {
  const base = series[0]?.price;
  if (base === undefined || base === 0) return series.map(() => 0);
  return series.map((q) => (q.price / base - 1) * 100);
}
