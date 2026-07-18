import { describe, expect, it } from "vitest";
import { buildInsights } from "./insights";
import { shiftIsoDays } from "./series";
import type { CropMeta, Series } from "./types";

const crop = (id: string): CropMeta => ({
  id,
  name: id,
  unit: "R$/saca",
  colorHex: "#000000",
});

/** One quote per consecutive calendar day starting at `startIso`. */
function daily(startIso: string, prices: readonly number[]): Series {
  return prices.map((price, i) => ({ date: shiftIsoDays(startIso, i), price }));
}

const series = (id: string, s: Series) => new Map([[id, s]]);

describe("extreme insights", () => {
  it("claims the longest window the data spans", () => {
    const prices = [...Array(399).fill(100), 90];
    const insights = buildInsights([crop("boi")], series("boi", daily("2025-06-01", prices)));

    const extreme = insights.find((i) => i.kind === "extreme");
    expect(extreme).toMatchObject({ direction: "low", windowDays: 365, price: 90 });
  });

  it("never claims a window longer than the history", () => {
    const prices = [...Array(40).fill(100), 90];
    const insights = buildInsights([crop("boi")], series("boi", daily("2026-06-01", prices)));

    const extreme = insights.find((i) => i.kind === "extreme");
    expect(extreme).toMatchObject({ direction: "low", windowDays: 30 });
  });

  it("detects highs as well as lows", () => {
    const prices = [...Array(40).fill(100), 110];
    const insights = buildInsights([crop("boi")], series("boi", daily("2026-06-01", prices)));

    const extreme = insights.find((i) => i.kind === "extreme");
    expect(extreme).toMatchObject({ direction: "high", windowDays: 30, price: 110 });
  });

  it("a flat series claims nothing", () => {
    const insights = buildInsights([crop("boi")], series("boi", daily("2026-06-01", Array(60).fill(100))));
    expect(insights).toEqual([]);
  });
});

describe("streak insights", () => {
  it("reports three or more consecutive moves in one direction", () => {
    const s = daily("2026-07-01", [100, 100, 100, 101, 102, 103]);
    const insights = buildInsights([crop("milho")], series("milho", s));

    const streak = insights.find((i) => i.kind === "streak");
    expect(streak).toMatchObject({ direction: "up", length: 3 });
    expect(streak && streak.kind === "streak" && streak.changePct).toBeCloseTo(3);
  });

  it("two moves are not a streak", () => {
    const s = daily("2026-07-01", [100, 100, 101, 102]);
    expect(buildInsights([crop("milho")], series("milho", s))).toEqual([]);
  });
});

describe("sharp-move insights", () => {
  it("reports a daily move at or above the threshold", () => {
    const s = daily("2026-07-01", [100, 100, 100, 98]);
    const insights = buildInsights([crop("cafe")], series("cafe", s));

    const sharp = insights.find((i) => i.kind === "sharp-move");
    expect(sharp && sharp.kind === "sharp-move" && sharp.changePct).toBeCloseTo(-2);
  });

  it("ignores moves below the threshold", () => {
    const s = daily("2026-07-01", [100, 100, 100, 99]);
    expect(buildInsights([crop("cafe")], series("cafe", s))).toEqual([]);
  });
});

describe("selection", () => {
  it("gives every crop a headline before a volatile crop takes two slots", () => {
    const a = daily("2025-06-01", [...Array(399).fill(100), 90]); // extreme + sharp move
    const b = daily("2026-07-01", [100, 100, 100, 97]); // sharp move only
    const insights = buildInsights(
      [crop("a"), crop("b")],
      new Map([
        ["a", a],
        ["b", b],
      ]),
      2,
    );

    expect(insights.map((i) => i.crop.id).sort()).toEqual(["a", "b"]);
  });

  it("caps the number of insights", () => {
    const a = daily("2025-06-01", [...Array(399).fill(100), 90]);
    const insights = buildInsights([crop("a")], series("a", a), 1);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.kind).toBe("extreme");
  });

  it("skips crops with no series", () => {
    const insights = buildInsights([crop("a"), crop("b")], series("a", daily("2026-07-01", [100])));
    expect(insights).toEqual([]);
  });
});
