import { describe, expect, it } from "vitest";
import { backtestSale } from "./backtest";
import type { Series } from "./types";

const series: Series = [
  { date: "2026-07-01", price: 100 },
  { date: "2026-07-03", price: 110 }, // no quote on the 2nd
  { date: "2026-07-06", price: 120 },
];

describe("backtestSale", () => {
  it("computes proceeds then and now", () => {
    const r = backtestSale(series, "2026-07-01", 50);
    expect(r).toMatchObject({
      sold: { date: "2026-07-01", price: 100 },
      current: { date: "2026-07-06", price: 120 },
      proceedsThen: 5000,
      proceedsNow: 6000,
    });
    expect(r!.changePct).toBeCloseTo(20);
  });

  it("resolves a non-trading day to the last prior quote", () => {
    const r = backtestSale(series, "2026-07-05", 1);
    expect(r!.sold).toEqual({ date: "2026-07-03", price: 110 });
  });

  it("has no answer for a date before the history starts", () => {
    expect(backtestSale(series, "2026-06-30", 1)).toBeUndefined();
  });

  it("rejects non-positive quantities", () => {
    expect(backtestSale(series, "2026-07-01", 0)).toBeUndefined();
    expect(backtestSale(series, "2026-07-01", -5)).toBeUndefined();
  });

  it("handles an empty series", () => {
    expect(backtestSale([], "2026-07-01", 1)).toBeUndefined();
  });

  it("selling on the latest date is a zero-change round trip", () => {
    const r = backtestSale(series, "2026-07-06", 10);
    expect(r!.proceedsThen).toBe(r!.proceedsNow);
    expect(r!.changePct).toBe(0);
  });
});
