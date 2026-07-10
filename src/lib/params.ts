/**
 * The dashboard's entire view state lives in the query string.
 *
 * The prototype held region, period, metric, crop selection and sort order in
 * React state, so no view was linkable, bookmarkable, or reachable with the
 * back button. Here every control is a plain <Link> that rewrites these params
 * and the server re-renders — which also means the segmented controls and chips
 * need no client-side JavaScript at all.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export const PERIODS = [7, 30, 90, 365] as const;
export type Period = (typeof PERIODS)[number];

export const METRICS = ["pct", "brl"] as const;
export type Metric = (typeof METRICS)[number];

export const SORT_KEYS = ["nome", "preco", "dia", "semana", "mes"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type SortDir = "asc" | "desc";

export interface DashboardParams {
  region: string;
  period: Period;
  metric: Metric;
  /** Crops plotted on the comparison chart. Never empty unless the user says so. */
  selected: string[];
  sortKey: SortKey;
  sortDir: SortDir;
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export const PARAM = {
  region: "praca",
  period: "periodo",
  metric: "metrica",
  crops: "culturas",
  sortKey: "ordenar",
  sortDir: "dir",
} as const;

export function parseDashboardParams(
  sp: SearchParams,
  validRegions: readonly string[],
  validCrops: readonly string[],
): DashboardParams {
  const region = one(sp[PARAM.region]);
  const period = Number(one(sp[PARAM.period]));
  const metric = one(sp[PARAM.metric]);
  const cropsRaw = one(sp[PARAM.crops]);
  const sortKey = one(sp[PARAM.sortKey]);
  const sortDir = one(sp[PARAM.sortDir]);

  // An explicit empty string means "no crops selected", which is a legitimate
  // state (the chart shows a prompt). Only an absent param takes the default.
  const selected =
    cropsRaw === undefined
      ? validCrops.filter((id) => DEFAULT_CROPS.includes(id))
      : cropsRaw
          .split(",")
          .map((s) => s.trim())
          .filter((id) => validCrops.includes(id));

  return {
    region:
      region && validRegions.includes(region) ? region : (validRegions[0] ?? ""),
    period: (PERIODS as readonly number[]).includes(period)
      ? (period as Period)
      : 30,
    metric: METRICS.includes(metric as Metric) ? (metric as Metric) : "pct",
    selected,
    sortKey: SORT_KEYS.includes(sortKey as SortKey) ? (sortKey as SortKey) : "dia",
    sortDir: sortDir === "asc" ? "asc" : "desc",
  };
}

const DEFAULT_CROPS = ["soja", "milho", "cafe"];

/** Serialises params back to a query string, omitting anything at its default. */
export function buildHref(
  base: DashboardParams,
  overrides: Partial<DashboardParams> = {},
): string {
  const p = { ...base, ...overrides };
  const q = new URLSearchParams();

  q.set(PARAM.region, p.region);
  if (p.period !== 30) q.set(PARAM.period, String(p.period));
  if (p.metric !== "pct") q.set(PARAM.metric, p.metric);
  q.set(PARAM.crops, p.selected.join(","));
  if (p.sortKey !== "dia") q.set(PARAM.sortKey, p.sortKey);
  if (p.sortDir !== "desc") q.set(PARAM.sortDir, p.sortDir);

  return `/?${q.toString()}`;
}

/** Toggling a crop chip on or off. */
export function toggleCrop(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id];
}

/**
 * Clicking the active sort column flips direction; clicking another column
 * selects it with a sensible initial direction — names ascend, numbers descend.
 */
export function nextSort(
  current: Pick<DashboardParams, "sortKey" | "sortDir">,
  key: SortKey,
): Pick<DashboardParams, "sortKey" | "sortDir"> {
  if (current.sortKey === key) {
    return { sortKey: key, sortDir: current.sortDir === "asc" ? "desc" : "asc" };
  }
  return { sortKey: key, sortDir: key === "nome" ? "asc" : "desc" };
}
