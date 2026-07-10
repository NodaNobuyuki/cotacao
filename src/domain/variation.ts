import { latest, quoteAsOf, shiftIsoDays } from "./series";
import type { Series } from "./types";

export interface Variation {
  readonly day: number | undefined;
  readonly week: number | undefined;
  readonly month: number | undefined;
}

function pctChange(from: number, to: number): number | undefined {
  if (from === 0) return undefined;
  return (to / from - 1) * 100;
}

/**
 * Change against the *previous trading day*, which is the definition the
 * market uses and is simply the preceding row — the source publishes no row
 * for a day it did not trade.
 */
export function dayChangePct(series: Series): number | undefined {
  const cur = series.at(-1);
  const prev = series.at(-2);
  if (!cur || !prev) return undefined;
  return pctChange(prev.price, cur.price);
}

/**
 * Change against the last quote on or before `calendarDays` ago.
 *
 * The prototype used a fixed array offset (`s[n-8]` for a week). That is only
 * correct if the market trades every calendar day. Against real CEPEA data —
 * closed on weekends and national holidays — `n-8` silently lands on a
 * different date for every crop and every week of the year.
 */
export function changePctOverCalendarDays(
  series: Series,
  calendarDays: number,
): number | undefined {
  const cur = latest(series);
  if (!cur) return undefined;
  const past = quoteAsOf(series, shiftIsoDays(cur.date, -calendarDays));
  if (!past || past.date === cur.date) return undefined;
  return pctChange(past.price, cur.price);
}

export function computeVariation(series: Series): Variation {
  return {
    day: dayChangePct(series),
    week: changePctOverCalendarDays(series, 7),
    month: changePctOverCalendarDays(series, 30),
  };
}
