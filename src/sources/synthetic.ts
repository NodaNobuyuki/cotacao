import type {
  CropDefinition,
  PriceSource,
  RawQuote,
  RegionDefinition,
} from "./types";

/**
 * Deterministic, obviously-fake price data for local development, CI, and the
 * public demo.
 *
 * The random walk is lifted from the original design prototype so the demo
 * still looks like the mockup, with two corrections: it emits trading days
 * only (no weekend rows), and it is anchored to a caller-supplied date rather
 * than a hardcoded one.
 *
 * Every row it produces is stamped `source: "synthetic"`, so a page rendering
 * this data can say so.
 */

const CROPS: readonly (CropDefinition & {
  base: number;
  vol: number;
  seed: number;
})[] = [
  { id: "soja", name: "Soja", unit: "R$/saca 60kg", colorHex: "#C57B2C", base: 128, vol: 0.9, seed: 12 },
  { id: "milho", name: "Milho", unit: "R$/saca 60kg", colorHex: "#D9A520", base: 62, vol: 0.55, seed: 77 },
  { id: "trigo", name: "Trigo", unit: "R$/saca 60kg", colorHex: "#B08247", base: 74, vol: 0.7, seed: 915 },
  { id: "cafe", name: "Café arábica", unit: "R$/saca 60kg", colorHex: "#7A4A38", base: 1850, vol: 20, seed: 333 },
  { id: "algodao", name: "Algodão", unit: "R$/@ 15kg", colorHex: "#4F7488", base: 148, vol: 1.5, seed: 501 },
];

const REGIONS: readonly (RegionDefinition & { mult: number })[] = [
  { id: "PR", name: "Paraná", mult: 1.0 },
  { id: "MT", name: "Mato Grosso", mult: 0.94 },
  { id: "SP", name: "São Paulo", mult: 1.03 },
  { id: "GO", name: "Goiás", mult: 0.96 },
  { id: "RS", name: "Rio Grande do Sul", mult: 1.01 },
];

/** Small fast PRNG; identical seed yields an identical series. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Ascending trading days in [fromIso, toIso], weekends excluded. */
function tradingDays(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  while (cur <= end) {
    if (!isWeekend(cur)) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Mean-reverting random walk. Seeded by (crop, region) so a given date always
 * gets the same price no matter which range is requested — required for
 * `fetchQuotes` to be idempotent across overlapping backfills.
 */
function walk(
  base: number,
  vol: number,
  seed: number,
  steps: number,
): number[] {
  const rnd = mulberry32(seed);
  const out: number[] = [];
  let price = base;
  for (let i = 0; i < steps; i++) {
    price += (base - price) * 0.015 + (rnd() - 0.5) * vol * 2.2;
    out.push(Math.max(price, base * 0.55));
  }
  return out;
}

/**
 * The walk is generated from a fixed epoch rather than from `fromIso`, so the
 * value for any given day is stable regardless of the window requested.
 */
const EPOCH = "2020-01-01";

export class SyntheticPriceSource implements PriceSource {
  readonly id = "synthetic";
  readonly isSynthetic = true;

  listCrops(): readonly CropDefinition[] {
    return CROPS.map(({ id, name, unit, colorHex }) => ({ id, name, unit, colorHex }));
  }

  listRegions(): readonly RegionDefinition[] {
    return REGIONS.map(({ id, name }) => ({ id, name }));
  }

  async fetchQuotes(fromIso: string, toIso: string): Promise<RawQuote[]> {
    const allDays = tradingDays(EPOCH, toIso);
    const wanted = new Set(tradingDays(fromIso, toIso));
    const rows: RawQuote[] = [];

    for (const crop of CROPS) {
      for (const [regionIndex, region] of REGIONS.entries()) {
        const prices = walk(
          crop.base * region.mult,
          crop.vol * (0.85 + regionIndex * 0.08),
          crop.seed + regionIndex * 137,
          allDays.length,
        );
        for (const [i, date] of allDays.entries()) {
          if (!wanted.has(date)) continue;
          rows.push({
            cropId: crop.id,
            regionId: region.id,
            date,
            price: Math.round(prices[i]! * 100) / 100,
          });
        }
      }
    }
    return rows;
  }
}
