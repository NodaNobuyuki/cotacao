import { latest, priceRange, shiftIsoDays, windowByCalendarDays } from "./series";
import { dayChangePct } from "./variation";
import type { CropMeta, Series } from "./types";

/**
 * Ready-made reads of the recent history: "lowest price in 3 months", "5
 * consecutive rises", "sharp daily move". The honesty rule mirrors the rest of
 * this codebase: an insight is only claimed when the data actually supports
 * it — "lowest in a year" requires a year of history, and a flat series claims
 * no extreme at all.
 */

export const EXTREME_WINDOWS = [365, 180, 90, 30] as const;
export type ExtremeWindow = (typeof EXTREME_WINDOWS)[number];

const MIN_STREAK = 3;
const SHARP_MOVE_PCT = 1.5;

export interface ExtremeInsight {
  readonly kind: "extreme";
  readonly direction: "low" | "high";
  readonly crop: CropMeta;
  readonly windowDays: ExtremeWindow;
  readonly price: number;
  readonly date: string;
}

export interface StreakInsight {
  readonly kind: "streak";
  readonly direction: "up" | "down";
  readonly crop: CropMeta;
  /** Consecutive moves in the same direction, counted over published days. */
  readonly length: number;
  readonly changePct: number;
}

export interface SharpMoveInsight {
  readonly kind: "sharp-move";
  readonly crop: CropMeta;
  readonly changePct: number;
}

export type Insight = ExtremeInsight | StreakInsight | SharpMoveInsight;

/**
 * The longest window in which the last quote is the minimum or maximum — but
 * only among windows the series actually spans, so a ten-day history can never
 * produce "lowest in a year".
 */
function extremeInsight(crop: CropMeta, series: Series): ExtremeInsight | undefined {
  const first = series[0];
  const last = latest(series);
  if (!first || !last) return undefined;

  for (const windowDays of EXTREME_WINDOWS) {
    if (first.date > shiftIsoDays(last.date, -windowDays)) continue;

    const range = priceRange(windowByCalendarDays(series, windowDays));
    if (!range || range.min === range.max) continue;

    const base = { kind: "extreme", crop, windowDays, price: last.price, date: last.date } as const;
    if (last.price <= range.min) return { ...base, direction: "low" };
    if (last.price >= range.max) return { ...base, direction: "high" };
  }
  return undefined;
}

function streakInsight(crop: CropMeta, series: Series): StreakInsight | undefined {
  if (series.length < MIN_STREAK + 1) return undefined;

  const dir = Math.sign(series.at(-1)!.price - series.at(-2)!.price);
  if (dir === 0) return undefined;

  let length = 1;
  for (let i = series.length - 2; i > 0; i--) {
    if (Math.sign(series[i]!.price - series[i - 1]!.price) !== dir) break;
    length++;
  }
  if (length < MIN_STREAK) return undefined;

  const from = series[series.length - 1 - length]!.price;
  if (from === 0) return undefined;
  const to = series.at(-1)!.price;

  return {
    kind: "streak",
    direction: dir > 0 ? "up" : "down",
    crop,
    length,
    changePct: (to / from - 1) * 100,
  };
}

function sharpMoveInsight(crop: CropMeta, series: Series): SharpMoveInsight | undefined {
  const pct = dayChangePct(series);
  if (pct === undefined || Math.abs(pct) < SHARP_MOVE_PCT) return undefined;
  return { kind: "sharp-move", crop, changePct: pct };
}

/**
 * Higher scores win a card slot. The scales are chosen so that a year-long
 * extreme (365) outranks a typical sharp move (2% → 60) and a typical streak
 * (4 → 60), while a 30-day extreme (30) does not.
 */
function score(insight: Insight): number {
  switch (insight.kind) {
    case "extreme":
      return insight.windowDays;
    case "streak":
      return insight.length * 15;
    case "sharp-move":
      return Math.abs(insight.changePct) * 30;
  }
}

/**
 * The top `max` insights across all crops. One headline per crop while slots
 * remain — a single volatile crop must not monopolise the section — then any
 * leftover slots are filled from the rest, best first.
 */
export function buildInsights(
  crops: readonly CropMeta[],
  seriesByCrop: ReadonlyMap<string, Series>,
  max = 4,
): Insight[] {
  const all: Insight[] = [];
  for (const crop of crops) {
    const series = seriesByCrop.get(crop.id);
    if (!series || series.length === 0) continue;
    for (const insight of [
      extremeInsight(crop, series),
      streakInsight(crop, series),
      sharpMoveInsight(crop, series),
    ]) {
      if (insight) all.push(insight);
    }
  }
  all.sort((a, b) => score(b) - score(a));

  const picked: Insight[] = [];
  const seenCrops = new Set<string>();
  for (const insight of all) {
    if (picked.length >= max) break;
    if (seenCrops.has(insight.crop.id)) continue;
    seenCrops.add(insight.crop.id);
    picked.push(insight);
  }
  for (const insight of all) {
    if (picked.length >= max) break;
    if (!picked.includes(insight)) picked.push(insight);
  }
  return picked.sort((a, b) => score(b) - score(a));
}
