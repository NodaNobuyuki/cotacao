import { latest, priceRange, windowByCalendarDays } from "./series";
import type { CropMeta, Series } from "./types";
import { computeVariation, type Variation } from "./variation";

export interface CropSnapshot {
  readonly crop: CropMeta;
  readonly price: number;
  readonly date: string;
  readonly variation: Variation;
  /** Trailing prices for the card sparkline. */
  readonly spark: readonly number[];
}

export type SortKey = "nome" | "preco" | "dia" | "semana" | "mes";
export type SortDir = "asc" | "desc";

const SPARK_DAYS = 7;

/**
 * Collapses each crop's full history into the numbers the dashboard shows.
 * Crops with no quotes at all are dropped rather than rendered as zeroes.
 */
export function buildSnapshots(
  crops: readonly CropMeta[],
  seriesByCrop: ReadonlyMap<string, Series>,
): CropSnapshot[] {
  const out: CropSnapshot[] = [];
  for (const crop of crops) {
    const series = seriesByCrop.get(crop.id);
    const last = series && latest(series);
    if (!series || !last) continue;

    out.push({
      crop,
      price: last.price,
      date: last.date,
      variation: computeVariation(series),
      spark: windowByCalendarDays(series, SPARK_DAYS).map((q) => q.price),
    });
  }
  return out;
}

/**
 * Undefined variations sort last regardless of direction, so `sign` is applied
 * to the value comparison only. Multiplying the undefined sentinel by `sign`
 * would float crops with no history to the top of a descending sort.
 */
function compareMaybe(
  a: number | undefined,
  b: number | undefined,
  sign: number,
): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return (a - b) * sign;
}

export function sortSnapshots(
  snapshots: readonly CropSnapshot[],
  key: SortKey,
  dir: SortDir,
): CropSnapshot[] {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = [...snapshots];

  sorted.sort((a, b) => {
    switch (key) {
      case "nome":
        return a.crop.name.localeCompare(b.crop.name, "pt-BR") * sign;
      case "preco":
        return (a.price - b.price) * sign;
      case "dia":
        return compareMaybe(a.variation.day, b.variation.day, sign);
      case "semana":
        return compareMaybe(a.variation.week, b.variation.week, sign);
      case "mes":
        return compareMaybe(a.variation.month, b.variation.month, sign);
    }
  });
  return sorted;
}

export interface ChartSeries {
  readonly cropId: string;
  readonly name: string;
  readonly colorHex: string;
  readonly dates: readonly string[];
  readonly values: readonly number[];
}

/**
 * Prepares the comparison chart's data.
 *
 * In "pct" mode each crop is rebased to its own first point in the window, so
 * café at R$1850 and milho at R$62 share a readable y-axis. In "brl" mode the
 * absolute prices are plotted and the scales genuinely do diverge — which is
 * why the UI warns about it rather than hiding it.
 */
export function buildChartSeries(
  crops: readonly CropMeta[],
  seriesByCrop: ReadonlyMap<string, Series>,
  selected: readonly string[],
  windowDays: number,
  metric: "pct" | "brl",
): ChartSeries[] {
  const out: ChartSeries[] = [];

  for (const crop of crops) {
    if (!selected.includes(crop.id)) continue;
    const full = seriesByCrop.get(crop.id);
    if (!full) continue;

    const win = windowByCalendarDays(full, windowDays);
    if (win.length === 0) continue;

    const base = win[0]!.price;
    const values =
      metric === "pct"
        ? win.map((q) => (base === 0 ? 0 : (q.price / base - 1) * 100))
        : win.map((q) => q.price);

    out.push({
      cropId: crop.id,
      name: crop.name,
      colorHex: crop.colorHex,
      dates: win.map((q) => q.date),
      values,
    });
  }
  return out;
}

/** Min/max across a crop's trailing window, for the detail KPIs in Phase 2. */
export function windowExtremes(series: Series, windowDays: number) {
  return priceRange(windowByCalendarDays(series, windowDays));
}
