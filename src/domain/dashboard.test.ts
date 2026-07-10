import { describe, expect, it } from "vitest";
import { buildChartSeries, buildSnapshots, sortSnapshots } from "./dashboard";
import type { CropMeta, Series } from "./types";

const crops: CropMeta[] = [
  { id: "soja", name: "Soja", unit: "R$/saca", colorHex: "#C57B2C" },
  { id: "cafe", name: "Café arábica", unit: "R$/saca", colorHex: "#7A4A38" },
  { id: "milho", name: "Milho", unit: "R$/saca", colorHex: "#D9A520" },
];

const soja: Series = [
  { date: "2026-06-08", price: 100 },
  { date: "2026-07-01", price: 120 },
  { date: "2026-07-08", price: 130 },
  { date: "2026-07-09", price: 132 },
];
const cafe: Series = [
  { date: "2026-06-08", price: 1800 },
  { date: "2026-07-01", price: 1900 },
  { date: "2026-07-08", price: 1850 },
  { date: "2026-07-09", price: 1840 },
];
/** Only one quote: too short for any variation. */
const milho: Series = [{ date: "2026-07-09", price: 62 }];

const byCrop = new Map<string, Series>([
  ["soja", soja],
  ["cafe", cafe],
  ["milho", milho],
]);

describe("buildSnapshots", () => {
  it("skips crops with no quotes rather than rendering a zero", () => {
    const snaps = buildSnapshots(crops, new Map([["soja", soja]]));
    expect(snaps.map((s) => s.crop.id)).toEqual(["soja"]);
  });

  it("carries the latest price and date", () => {
    const s = buildSnapshots(crops, byCrop).find((x) => x.crop.id === "soja")!;
    expect(s.price).toBe(132);
    expect(s.date).toBe("2026-07-09");
  });

  it("leaves variations undefined when history is too short", () => {
    const s = buildSnapshots(crops, byCrop).find((x) => x.crop.id === "milho")!;
    expect(s.variation.day).toBeUndefined();
    expect(s.variation.week).toBeUndefined();
  });
});

describe("sortSnapshots", () => {
  const snaps = buildSnapshots(crops, byCrop);

  it("sorts by name using pt-BR collation, so 'Café' precedes 'Milho'", () => {
    const names = sortSnapshots(snaps, "nome", "asc").map((s) => s.crop.name);
    expect(names).toEqual(["Café arábica", "Milho", "Soja"]);
  });

  it("sorts by price descending", () => {
    const ids = sortSnapshots(snaps, "preco", "desc").map((s) => s.crop.id);
    expect(ids[0]).toBe("cafe");
  });

  it("pushes undefined variations last in both directions", () => {
    expect(sortSnapshots(snaps, "dia", "desc").at(-1)!.crop.id).toBe("milho");
    expect(sortSnapshots(snaps, "dia", "asc").at(-1)!.crop.id).toBe("milho");
  });

  it("does not mutate its input", () => {
    const before = snaps.map((s) => s.crop.id);
    sortSnapshots(snaps, "preco", "asc");
    expect(snaps.map((s) => s.crop.id)).toEqual(before);
  });
});

describe("buildChartSeries", () => {
  it("includes only the selected crops, in catalogue order", () => {
    const out = buildChartSeries(crops, byCrop, ["milho", "soja"], 365, "brl");
    expect(out.map((s) => s.cropId)).toEqual(["soja", "milho"]);
  });

  it("plots absolute prices in brl mode", () => {
    const [s] = buildChartSeries(crops, byCrop, ["soja"], 365, "brl");
    expect(s!.values.at(-1)).toBe(132);
  });

  it("rebases each crop to its own window start in pct mode", () => {
    const out = buildChartSeries(crops, byCrop, ["soja", "cafe"], 365, "pct");
    // Both start at 0% despite absolute prices an order of magnitude apart.
    expect(out[0]!.values[0]).toBeCloseTo(0);
    expect(out[1]!.values[0]).toBeCloseTo(0);
    expect(out[0]!.values.at(-1)).toBeCloseTo(32); // 100 -> 132
    expect(out[1]!.values.at(-1)).toBeCloseTo(2.22, 1); // 1800 -> 1840
  });

  it("narrows the window to the requested period", () => {
    const week = buildChartSeries(crops, byCrop, ["soja"], 7, "brl");
    expect(week[0]!.dates).toEqual(["2026-07-08", "2026-07-09"]);
  });

  it("drops crops whose window has no quotes", () => {
    const out = buildChartSeries(crops, new Map(), ["soja"], 30, "pct");
    expect(out).toEqual([]);
  });
});
