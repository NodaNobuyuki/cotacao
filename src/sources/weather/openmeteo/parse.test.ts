import { describe, expect, it } from "vitest";
import { LOCAIS } from "../locais";
import type { WeatherPoint } from "../types";
import { ARCHIVE_DEPTHS, FORECAST_DEPTHS, hourlyVarsFor } from "./params";
import { aggregateSoilByDay, parseOpenMeteo, umidadeZonaRadicular } from "./parse";

const FORECAST_OPTS = {
  depths: FORECAST_DEPTHS,
  fonte: "Open-Meteo",
  modelo: "icon_seamless",
  tipo: "previsao" as const,
};

/** Builds 24 hourly stamps for one civil day. */
function hoursOf(day: string): string[] {
  return Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00`);
}

describe("parseOpenMeteo", () => {
  it("maps the columnar daily block onto one point per day", () => {
    const points = parseOpenMeteo(
      {
        latitude: -21.1775,
        longitude: -47.81028,
        daily: {
          time: ["2026-07-27", "2026-07-28"],
          temperature_2m_max: [28.4, 30.1],
          temperature_2m_min: [14.2, 15.0],
          temperature_2m_mean: [21.1, 22.3],
          precipitation_sum: [0, 7.5],
          et0_fao_evapotranspiration: [3.9, 4.2],
          relative_humidity_2m_mean: [61, 68],
          relative_humidity_2m_min: [32, 41],
          dew_point_2m_mean: [12.8, 14.1],
          shortwave_radiation_sum: [18.3, 15.9],
          wind_speed_10m_max: [11.2, 19.4],
          wind_direction_10m_dominant: [95, 130],
        },
      },
      FORECAST_OPTS,
    );

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      data: "2026-07-27",
      latitude: -21.1775,
      tempMaxC: 28.4,
      tempMinC: 14.2,
      precipitacaoMm: 0,
      evapotranspiracaoMm: 3.9,
      umidadeRelativaMinPct: 32,
      ventoDirecaoDominanteGraus: 95,
      fonte: "Open-Meteo",
      modelo: "icon_seamless",
      tipo: "previsao",
    });
  });

  it("keeps a zero precipitation reading distinct from a missing one", () => {
    const points = parseOpenMeteo(
      {
        daily: {
          time: ["2026-07-27", "2026-07-28"],
          precipitation_sum: [0, null],
        },
      },
      FORECAST_OPTS,
    );

    expect(points[0]?.precipitacaoMm).toBe(0);
    expect(points[1]?.precipitacaoMm).toBeNull();
  });

  it("returns nulls rather than throwing when the model omits a variable", () => {
    // ERA5-Land, for one, publishes no wind at all.
    const points = parseOpenMeteo(
      { daily: { time: ["2026-07-27"], temperature_2m_max: [28.4] } },
      FORECAST_OPTS,
    );

    expect(points[0]?.tempMaxC).toBe(28.4);
    expect(points[0]?.ventoVelocidadeMaxKmh).toBeNull();
    expect(points[0]?.evapotranspiracaoMm).toBeNull();
  });

  it("reports every layer past the soil horizon, with null readings", () => {
    // The real failure mode: 16 forecast days requested, soil moisture only
    // modelled to about D+7. The array must not silently shrink.
    const points = parseOpenMeteo(
      { daily: { time: ["2026-08-10"] }, hourly: { time: [] } },
      FORECAST_OPTS,
    );

    expect(points[0]?.solo).toHaveLength(FORECAST_DEPTHS.length);
    expect(points[0]?.solo.every((l) => l.umidade === null)).toBe(true);
    expect(points[0]?.solo[0]?.profundidadeBaseCm).toBe(1);
  });

  it("returns an empty list when there is no daily block", () => {
    expect(parseOpenMeteo({}, FORECAST_OPTS)).toEqual([]);
  });
});

describe("aggregateSoilByDay", () => {
  it("averages the 24 hourly samples of each day, per layer", () => {
    const soil = aggregateSoilByDay(
      {
        time: [...hoursOf("2026-07-27"), ...hoursOf("2026-07-28")],
        // 0.30 all day, then 0.20 all day.
        soil_moisture_0_to_1cm: [
          ...Array<number>(24).fill(0.3),
          ...Array<number>(24).fill(0.2),
        ],
        soil_temperature_0cm: [
          ...Array<number>(24).fill(18),
          ...Array<number>(24).fill(22),
        ],
      },
      FORECAST_DEPTHS,
    );

    expect(soil.get("2026-07-27")?.[0]?.umidade).toBeCloseTo(0.3, 6);
    expect(soil.get("2026-07-28")?.[0]?.umidade).toBeCloseTo(0.2, 6);
    expect(soil.get("2026-07-28")?.[0]?.temperatura).toBeCloseTo(22, 6);
  });

  it("averages only the hours that reported, not treating nulls as zero", () => {
    // A day averaging 0.3 must not become 0.15 because half the hours are gone.
    const soil = aggregateSoilByDay(
      {
        time: hoursOf("2026-07-27"),
        soil_moisture_0_to_1cm: Array.from({ length: 24 }, (_, h) =>
          h < 12 ? 0.3 : null,
        ),
      },
      FORECAST_DEPTHS,
    );

    expect(soil.get("2026-07-27")?.[0]?.umidade).toBeCloseTo(0.3, 6);
  });

  it("yields null, never zero, for a day with no readings at all", () => {
    const soil = aggregateSoilByDay(
      {
        time: hoursOf("2026-08-10"),
        soil_moisture_0_to_1cm: Array<number | null>(24).fill(null),
      },
      FORECAST_DEPTHS,
    );

    expect(soil.get("2026-08-10")?.[0]?.umidade).toBeNull();
  });

  it("groups by date rather than by a fixed 24-hour stride", () => {
    // A 23-hour day (spring DST) would corrupt every later day under a stride.
    const shortDay = hoursOf("2026-10-18").slice(0, 23);
    const soil = aggregateSoilByDay(
      {
        time: [...shortDay, ...hoursOf("2026-10-19")],
        soil_moisture_0_to_1cm: [
          ...Array<number>(23).fill(0.4),
          ...Array<number>(24).fill(0.1),
        ],
      },
      FORECAST_DEPTHS,
    );

    expect(soil.get("2026-10-18")?.[0]?.umidade).toBeCloseTo(0.4, 6);
    expect(soil.get("2026-10-19")?.[0]?.umidade).toBeCloseTo(0.1, 6);
  });
});

describe("umidadeZonaRadicular", () => {
  function pointWith(solo: WeatherPoint["solo"]): WeatherPoint {
    return {
      latitude: 0,
      longitude: 0,
      data: "2026-07-27",
      tempMinC: null,
      tempMaxC: null,
      tempMediaC: null,
      precipitacaoMm: null,
      umidadeRelativaMediaPct: null,
      umidadeRelativaMinPct: null,
      pontoOrvalhoMedioC: null,
      evapotranspiracaoMm: null,
      radiacaoSolarMjM2: null,
      ventoVelocidadeMaxKmh: null,
      ventoDirecaoDominanteGraus: null,
      solo,
      fonte: "Open-Meteo",
      modelo: "era5",
      tipo: "historico",
    };
  }

  it("weights each layer by the thickness that falls inside 0-30cm", () => {
    // ERA5: 0-7cm at 0.20, 7-28cm at 0.30, plus 28-100cm contributing only the
    // 2cm that overlaps → (0.20*7 + 0.30*21 + 0.40*2) / 30.
    const value = umidadeZonaRadicular(
      pointWith([
        { profundidadeTopoCm: 0, profundidadeBaseCm: 7, umidade: 0.2, temperatura: null },
        { profundidadeTopoCm: 7, profundidadeBaseCm: 28, umidade: 0.3, temperatura: null },
        { profundidadeTopoCm: 28, profundidadeBaseCm: 100, umidade: 0.4, temperatura: null },
      ]),
    );

    expect(value).toBeCloseTo((0.2 * 7 + 0.3 * 21 + 0.4 * 2) / 30, 6);
  });

  it("ignores layers entirely below the root zone", () => {
    const value = umidadeZonaRadicular(
      pointWith([
        { profundidadeTopoCm: 0, profundidadeBaseCm: 30, umidade: 0.25, temperatura: null },
        { profundidadeTopoCm: 100, profundidadeBaseCm: 255, umidade: 0.9, temperatura: null },
      ]),
    );

    expect(value).toBeCloseTo(0.25, 6);
  });

  it("gives comparable answers across the two native grids", () => {
    // The whole point of the accessor: ICON's 5 bands and ERA5's 4 bands are
    // different shapes, but a uniformly wet profile must read the same.
    const icon = umidadeZonaRadicular(
      pointWith(
        FORECAST_DEPTHS.map((d) => ({
          profundidadeTopoCm: d.topoCm,
          profundidadeBaseCm: d.baseCm,
          umidade: 0.28,
          temperatura: null,
        })),
      ),
    );
    const era5 = umidadeZonaRadicular(
      pointWith(
        ARCHIVE_DEPTHS.map((d) => ({
          profundidadeTopoCm: d.topoCm,
          profundidadeBaseCm: d.baseCm,
          umidade: 0.28,
          temperatura: null,
        })),
      ),
    );

    expect(icon).toBeCloseTo(0.28, 6);
    expect(era5).toBeCloseTo(0.28, 6);
  });

  it("is null when no layer in the root zone reported", () => {
    const value = umidadeZonaRadicular(
      pointWith([
        { profundidadeTopoCm: 0, profundidadeBaseCm: 7, umidade: null, temperatura: 19 },
      ]),
    );

    expect(value).toBeNull();
  });
});

describe("catálogo de locais", () => {
  it("has unique ids and coordinates inside Brazil's southeast/south", () => {
    expect(new Set(LOCAIS.map((l) => l.id)).size).toBe(LOCAIS.length);
    for (const local of LOCAIS) {
      expect(local.lat).toBeGreaterThan(-27);
      expect(local.lat).toBeLessThan(-19);
      expect(local.lon).toBeGreaterThan(-55);
      expect(local.lon).toBeLessThan(-46);
    }
  });
});

describe("hourlyVarsFor", () => {
  it("does not request the same variable twice when bands share a depth", () => {
    // ICON pairs both 0-1cm and 1-3cm with soil_temperature_0cm.
    const vars = hourlyVarsFor(FORECAST_DEPTHS);
    expect(new Set(vars).size).toBe(vars.length);
    expect(vars).toContain("soil_moisture_27_to_81cm");
  });
});
