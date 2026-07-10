import { describe, expect, it } from "vitest";
import type { Series } from "./types";
import {
  changePctOverCalendarDays,
  computeVariation,
  dayChangePct,
} from "./variation";

/** Mon-Fri only, mirroring a market that is closed at weekends. */
function tradingSeries(start: string, prices: number[]): Series {
  const out: { date: string; price: number }[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (const price of prices) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    out.push({ date: d.toISOString().slice(0, 10), price });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("dayChangePct", () => {
  it("compares against the previous trading day", () => {
    const s: Series = [
      { date: "2026-07-02", price: 100 },
      { date: "2026-07-03", price: 110 },
    ];
    expect(dayChangePct(s)).toBeCloseTo(10);
  });

  it("bridges a weekend without a synthetic zero", () => {
    // Friday then Monday: consecutive rows, three calendar days apart.
    const s: Series = [
      { date: "2026-07-03", price: 100 },
      { date: "2026-07-06", price: 95 },
    ];
    expect(dayChangePct(s)).toBeCloseTo(-5);
  });

  it("is undefined with a single quote", () => {
    expect(dayChangePct([{ date: "2026-07-03", price: 100 }])).toBeUndefined();
  });

  it("is undefined on an empty series", () => {
    expect(dayChangePct([])).toBeUndefined();
  });
});

describe("changePctOverCalendarDays", () => {
  it("anchors on the last trading day on or before the cutoff", () => {
    // 2026-07-13 is a Monday. Seven calendar days back is 2026-07-06, also a
    // Monday and a trading day, so the anchor is exact.
    const s: Series = [
      { date: "2026-07-06", price: 100 },
      { date: "2026-07-07", price: 101 },
      { date: "2026-07-10", price: 105 },
      { date: "2026-07-13", price: 120 },
    ];
    expect(changePctOverCalendarDays(s, 7)).toBeCloseTo(20);
  });

  it("falls back to the prior trading day when the cutoff lands on a weekend", () => {
    // Latest is Wed 2026-07-08; seven days back is Wed 2026-07-01, missing
    // here, so the anchor must be Tue 2026-06-30 rather than nothing.
    const s: Series = [
      { date: "2026-06-30", price: 200 },
      { date: "2026-07-02", price: 210 },
      { date: "2026-07-08", price: 220 },
    ];
    expect(changePctOverCalendarDays(s, 7)).toBeCloseTo(10);
  });

  it("is undefined when no quote precedes the cutoff", () => {
    const s: Series = [
      { date: "2026-07-07", price: 100 },
      { date: "2026-07-08", price: 110 },
    ];
    expect(changePctOverCalendarDays(s, 30)).toBeUndefined();
  });

  /**
   * Regression test for the prototype's `s[n-8]` weekly change.
   *
   * With weekends removed, index n-8 is eight *trading* days back, which is ten
   * or more calendar days — not a week. Pin the difference so nobody
   * reintroduces offset-based maths.
   */
  it("does not agree with a fixed array offset once weekends are absent", () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const s = tradingSeries("2026-06-01", prices);

    const n = s.length;
    const byOffset = (s[n - 1]!.price / s[n - 8]!.price - 1) * 100;
    const byDate = changePctOverCalendarDays(s, 7)!;

    expect(byDate).toBeGreaterThan(0);
    expect(byOffset).not.toBeCloseTo(byDate, 5);
  });
});

describe("computeVariation", () => {
  it("returns undefined members rather than throwing on short history", () => {
    const v = computeVariation([{ date: "2026-07-08", price: 100 }]);
    expect(v).toEqual({ day: undefined, week: undefined, month: undefined });
  });

  it("computes all three horizons on a full year", () => {
    const prices = Array.from({ length: 260 }, (_, i) => 100 + i * 0.1);
    const v = computeVariation(tradingSeries("2025-07-08", prices));
    expect(v.day).toBeDefined();
    expect(v.week).toBeDefined();
    expect(v.month).toBeDefined();
    expect(v.month!).toBeGreaterThan(v.week!);
  });
});
