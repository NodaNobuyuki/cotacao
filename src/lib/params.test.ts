import { describe, expect, it } from "vitest";
import { buildHref, nextSort, parseDashboardParams, toggleCrop } from "./params";

const REGIONS = ["PR", "MT", "SP"];
const CROPS = ["soja", "milho", "cafe", "trigo"];

const parse = (sp: Record<string, string | undefined>) =>
  parseDashboardParams(sp, REGIONS, CROPS);

describe("parseDashboardParams", () => {
  it("falls back to sane defaults when nothing is supplied", () => {
    const p = parse({});
    expect(p).toMatchObject({
      region: "PR",
      period: 30,
      metric: "pct",
      sortKey: "dia",
      sortDir: "desc",
    });
    expect(p.selected).toEqual(["soja", "milho", "cafe"]);
  });

  it("rejects an unknown region rather than querying for it", () => {
    expect(parse({ praca: "XX" }).region).toBe("PR");
  });

  it("rejects a period that is not one of the offered windows", () => {
    expect(parse({ periodo: "13" }).period).toBe(30);
    expect(parse({ periodo: "90" }).period).toBe(90);
  });

  it("silently drops crop ids that do not exist", () => {
    expect(parse({ culturas: "soja,dragonfruit" }).selected).toEqual(["soja"]);
  });

  /** An empty chart is a state the user can choose, not a missing param. */
  it("distinguishes an empty selection from an absent one", () => {
    expect(parse({ culturas: "" }).selected).toEqual([]);
    expect(parse({}).selected.length).toBeGreaterThan(0);
  });

  it("ignores an invalid sort key", () => {
    expect(parse({ ordenar: "drop table" }).sortKey).toBe("dia");
  });
});

describe("buildHref", () => {
  it("omits params that sit at their default", () => {
    const href = buildHref(parse({}));
    expect(href).toContain("praca=PR");
    expect(href).not.toContain("periodo=");
    expect(href).not.toContain("metrica=");
  });

  it("round-trips through parseDashboardParams", () => {
    const original = parse({
      praca: "MT",
      periodo: "365",
      metrica: "brl",
      culturas: "cafe,trigo",
      ordenar: "preco",
      dir: "asc",
    });
    const qs = buildHref(original).slice(2);
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(parseDashboardParams(sp, REGIONS, CROPS)).toEqual(original);
  });

  it("round-trips an empty crop selection", () => {
    const original = parse({ culturas: "" });
    const sp = Object.fromEntries(new URLSearchParams(buildHref(original).slice(2)));
    expect(parseDashboardParams(sp, REGIONS, CROPS).selected).toEqual([]);
  });
});

describe("toggleCrop", () => {
  it("adds and removes", () => {
    expect(toggleCrop(["soja"], "milho")).toEqual(["soja", "milho"]);
    expect(toggleCrop(["soja", "milho"], "soja")).toEqual(["milho"]);
  });
});

describe("nextSort", () => {
  it("flips direction when the same column is clicked again", () => {
    expect(nextSort({ sortKey: "dia", sortDir: "desc" }, "dia")).toEqual({
      sortKey: "dia",
      sortDir: "asc",
    });
  });

  it("starts names ascending and numbers descending", () => {
    expect(nextSort({ sortKey: "dia", sortDir: "desc" }, "nome").sortDir).toBe("asc");
    expect(nextSort({ sortKey: "nome", sortDir: "asc" }, "preco").sortDir).toBe("desc");
  });
});
