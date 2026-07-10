import { describe, expect, it } from "vitest";
import { SyntheticPriceSource } from "./synthetic";

const src = new SyntheticPriceSource();

describe("SyntheticPriceSource", () => {
  it("declares itself synthetic so the UI can label it", () => {
    expect(src.isSynthetic).toBe(true);
    expect(src.id).toBe("synthetic");
  });

  it("emits no rows for weekends", async () => {
    // 2026-07-04 is a Saturday, 2026-07-05 a Sunday.
    const rows = await src.fetchQuotes("2026-07-03", "2026-07-06");
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    expect(dates).toEqual(["2026-07-03", "2026-07-06"]);
  });

  it("covers every crop and region on a trading day", async () => {
    const rows = await src.fetchQuotes("2026-07-06", "2026-07-06");
    expect(rows).toHaveLength(src.listCrops().length * src.listRegions().length);
  });

  /**
   * Backfills and retries request overlapping ranges. If a day's price shifted
   * depending on the window it was fetched in, ingestion would rewrite history
   * on every run and alerts would fire on phantom moves.
   */
  it("gives a day the same price regardless of the range requested", async () => {
    const narrow = await src.fetchQuotes("2026-07-06", "2026-07-08");
    const wide = await src.fetchQuotes("2026-01-01", "2026-07-08");

    const key = (r: { cropId: string; regionId: string; date: string }) =>
      `${r.cropId}|${r.regionId}|${r.date}`;
    const wideByKey = new Map(wide.map((r) => [key(r), r.price]));

    expect(narrow.length).toBeGreaterThan(0);
    for (const r of narrow) {
      expect(wideByKey.get(key(r))).toBe(r.price);
    }
  });

  it("is deterministic across instances", async () => {
    const a = await new SyntheticPriceSource().fetchQuotes("2026-07-06", "2026-07-08");
    const b = await new SyntheticPriceSource().fetchQuotes("2026-07-06", "2026-07-08");
    expect(a).toEqual(b);
  });

  it("returns prices in a plausible range for each crop", async () => {
    const rows = await src.fetchQuotes("2026-07-06", "2026-07-06");
    const cafe = rows.filter((r) => r.cropId === "cafe");
    const milho = rows.filter((r) => r.cropId === "milho");
    expect(cafe.every((r) => r.price > 500)).toBe(true);
    expect(milho.every((r) => r.price > 10 && r.price < 200)).toBe(true);
  });
});
