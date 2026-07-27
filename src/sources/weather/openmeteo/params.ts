/**
 * The exact Open-Meteo variable names this layer requests, and the soil depth
 * grids each endpoint answers with.
 *
 * Verified against the live API on 2026-07-27, not taken from memory — the
 * parameter names have changed shape before (`relativehumidity_2m` →
 * `relative_humidity_2m`). If a request starts coming back with a "cannot
 * initialize" error, re-check the names here first.
 */

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/**
 * Daily variables. Both endpoints accept this identical list — confirmed by
 * requesting it against each and diffing the returned `daily_units`.
 */
export const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "precipitation_sum",
  "et0_fao_evapotranspiration",
  "relative_humidity_2m_mean",
  "relative_humidity_2m_min",
  "dew_point_2m_mean",
  "shortwave_radiation_sum",
  "wind_speed_10m_max",
  "wind_direction_10m_dominant",
] as const;

/** A depth band, and the Open-Meteo variable suffix that carries it. */
export interface DepthBand {
  readonly topoCm: number;
  readonly baseCm: number;
  /** Suffix of `soil_moisture_*`, e.g. "0_to_7cm". */
  readonly moistureSuffix: string;
  /**
   * Full `soil_temperature_*` variable name. Forecast reports temperature at
   * single depths (`soil_temperature_6cm`) rather than over bands, so this is
   * not derivable from the moisture suffix.
   */
  readonly temperatureVar: string;
}

/**
 * Forecast grid (ICON). Note the asymmetry the API itself has: moisture is
 * banded (0-1cm) while temperature is a point depth (0cm). We pair each band
 * with the point depth that falls inside it.
 */
export const FORECAST_DEPTHS: readonly DepthBand[] = [
  { topoCm: 0, baseCm: 1, moistureSuffix: "0_to_1cm", temperatureVar: "soil_temperature_0cm" },
  { topoCm: 1, baseCm: 3, moistureSuffix: "1_to_3cm", temperatureVar: "soil_temperature_0cm" },
  { topoCm: 3, baseCm: 9, moistureSuffix: "3_to_9cm", temperatureVar: "soil_temperature_6cm" },
  { topoCm: 9, baseCm: 27, moistureSuffix: "9_to_27cm", temperatureVar: "soil_temperature_18cm" },
  { topoCm: 27, baseCm: 81, moistureSuffix: "27_to_81cm", temperatureVar: "soil_temperature_54cm" },
];

/** Archive grid (ERA5). Here moisture and temperature share the same bands. */
export const ARCHIVE_DEPTHS: readonly DepthBand[] = [
  {
    topoCm: 0,
    baseCm: 7,
    moistureSuffix: "0_to_7cm",
    temperatureVar: "soil_temperature_0_to_7cm",
  },
  {
    topoCm: 7,
    baseCm: 28,
    moistureSuffix: "7_to_28cm",
    temperatureVar: "soil_temperature_7_to_28cm",
  },
  {
    topoCm: 28,
    baseCm: 100,
    moistureSuffix: "28_to_100cm",
    temperatureVar: "soil_temperature_28_to_100cm",
  },
  {
    topoCm: 100,
    baseCm: 255,
    moistureSuffix: "100_to_255cm",
    temperatureVar: "soil_temperature_100_to_255cm",
  },
];

/** Hourly variables needed to build the soil layers for a given grid. */
export function hourlyVarsFor(depths: readonly DepthBand[]): string[] {
  const vars = new Set<string>();
  for (const d of depths) {
    vars.add(`soil_moisture_${d.moistureSuffix}`);
    vars.add(d.temperatureVar);
  }
  return [...vars];
}

/** Open-Meteo's hard cap on `forecast_days`. */
export const MAX_FORECAST_DAYS = 16;

/**
 * Soil moisture is only modelled to roughly D+7, even though temperature runs
 * to D+15 and ET₀ covers all 16 days. Documented here because the resulting
 * nulls look like a bug and are not one.
 */
export const SOIL_MOISTURE_HORIZON_DAYS = 8;
