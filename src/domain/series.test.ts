import { describe, expect, it } from "vitest";
import {
  priceRange,
  quoteAsOf,
  rebaseToPercent,
  shiftIsoDays,
  windowByCalendarDays,
} from "./series";
import type { Series } from "./types";

const s: Series = [
  { date: "2026-06-30", price: 200 },
  { date: "2026-07-02", price: 210 },
  { date: "2026-07-08", price: 220 },
];

describe("shiftIsoDays", () => {
  it("moves backwards across a month boundary", () => {
    expect(shiftIsoDays("2026-07-02", -7)).toBe("2026-06-25");
  });

  it("handles a leap day", () => {
    expect(shiftIsoDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("is not perturbed by the host timezone", () => {
    // A naive `new Date("2026-01-01")` in a UTC-3 zone would roll back a day.
    expect(shiftIsoDays("2026-01-01", 0)).toBe("2026-01-01");
  });
});

describe("quoteAsOf", () => {
  it("returns an exact match", () => {
    expect(quoteAsOf(s, "2026-07-02")?.price).toBe(210);
  });

  it("returns the most recent prior quote when the day has none", () => {
    expect(quoteAsOf(s, "2026-07-05")?.price).toBe(210);
  });

  it("returns undefined before the series begins", () => {
    expect(quoteAsOf(s, "2026-06-01")).toBeUndefined();
  });

  it("returns the last quote for a future date", () => {
    expect(quoteAsOf(s, "2027-01-01")?.price).toBe(220);
  });

  it("returns undefined on an empty series", () => {
    expect(quoteAsOf([], "2026-07-02")).toBeUndefined();
  });
});

describe("windowByCalendarDays", () => {
  it("keeps quotes within the trailing window", () => {
    expect(windowByCalendarDays(s, 7).map((q) => q.price)).toEqual([210, 220]);
  });

  it("keeps everything when the window exceeds the history", () => {
    expect(windowByCalendarDays(s, 365)).toHaveLength(3);
  });

  it("returns empty for an empty series", () => {
    expect(windowByCalendarDays([], 30)).toEqual([]);
  });
});

describe("priceRange", () => {
  it("finds min and max", () => {
    expect(priceRange(s)).toEqual({ min: 200, max: 220 });
  });

  it("is undefined for an empty series", () => {
    expect(priceRange([])).toBeUndefined();
  });
});

describe("rebaseToPercent", () => {
  it("expresses each point relative to the first", () => {
    const out = rebaseToPercent(s);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(5);
    expect(out[2]).toBeCloseTo(10);
  });

  it("degrades to zeroes rather than dividing by a zero base", () => {
    expect(rebaseToPercent([{ date: "2026-07-08", price: 0 }])).toEqual([0]);
  });
});
