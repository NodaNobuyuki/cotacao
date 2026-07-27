/**
 * Turns Open-Meteo's columnar JSON into WeatherPoint[].
 *
 * The API answers with parallel arrays — `daily.time[i]` pairs with
 * `daily.temperature_2m_max[i]` — rather than a list of records, so everything
 * here is index-aligned. Any variable the response omits is treated as all
 * nulls instead of throwing: a model that lacks one field should not cost us
 * the ten it does have.
 */
import type { SoilLayer, WeatherPoint, WeatherPointTipo } from "../types";
import type { DepthBand } from "./params";

/** The subset of Open-Meteo's envelope this module reads. */
export interface OpenMeteoResponse {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly daily?: Record<string, unknown>;
  readonly hourly?: Record<string, unknown>;
  readonly error?: boolean;
  readonly reason?: string;
}

export interface ParseOptions {
  readonly depths: readonly DepthBand[];
  readonly fonte: string;
  readonly modelo: string;
  readonly tipo: WeatherPointTipo;
}

/** Reads one numeric column, tolerating absence and non-numeric junk. */
function column(block: Record<string, unknown> | undefined, name: string): (number | null)[] {
  const raw = block?.[name];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
}

function times(block: Record<string, unknown> | undefined): string[] {
  const raw = block?.["time"];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (typeof v === "string" ? v : ""));
}

function at(values: readonly (number | null)[], index: number): number | null {
  return values[index] ?? null;
}

function mean(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Averages the 24 hourly soil samples of each civil day into one layer set.
 *
 * Keyed off the date prefix of the hourly timestamp rather than by slicing in
 * blocks of 24: with `timezone` set, Open-Meteo returns local time, and a DST
 * transition makes a day 23 or 25 hours long. Brazil has no DST today, but a
 * fixed stride would fail silently in any market that does.
 *
 * A day with no samples at all yields null, never zero — beyond the soil
 * horizon there is no measurement, and 0 m³/m³ would read as bone-dry soil.
 */
export function aggregateSoilByDay(
  hourly: Record<string, unknown> | undefined,
  depths: readonly DepthBand[],
): Map<string, SoilLayer[]> {
  const stamps = times(hourly);
  const byDay = new Map<string, number[]>();
  stamps.forEach((stamp, index) => {
    const day = stamp.slice(0, 10);
    if (day === "") return;
    const bucket = byDay.get(day);
    if (bucket === undefined) byDay.set(day, [index]);
    else bucket.push(index);
  });

  const columns = new Map<string, (number | null)[]>();
  const read = (name: string): (number | null)[] => {
    const cached = columns.get(name);
    if (cached !== undefined) return cached;
    const values = column(hourly, name);
    columns.set(name, values);
    return values;
  };

  const result = new Map<string, SoilLayer[]>();
  for (const [day, indices] of byDay) {
    const layers = depths.map((depth): SoilLayer => {
      const moisture = read(`soil_moisture_${depth.moistureSuffix}`);
      const temperature = read(depth.temperatureVar);
      return {
        profundidadeTopoCm: depth.topoCm,
        profundidadeBaseCm: depth.baseCm,
        umidade: mean(indices.map((i) => at(moisture, i))),
        temperatura: mean(indices.map((i) => at(temperature, i))),
      };
    });
    result.set(day, layers);
  }
  return result;
}

/** Columnar response → one WeatherPoint per day present in `daily.time`. */
export function parseOpenMeteo(
  response: OpenMeteoResponse,
  options: ParseOptions,
): WeatherPoint[] {
  const days = times(response.daily);
  if (days.length === 0) return [];

  const soilByDay = aggregateSoilByDay(response.hourly, options.depths);

  const tempMax = column(response.daily, "temperature_2m_max");
  const tempMin = column(response.daily, "temperature_2m_min");
  const tempMean = column(response.daily, "temperature_2m_mean");
  const precip = column(response.daily, "precipitation_sum");
  const et0 = column(response.daily, "et0_fao_evapotranspiration");
  const rhMean = column(response.daily, "relative_humidity_2m_mean");
  const rhMin = column(response.daily, "relative_humidity_2m_min");
  const dew = column(response.daily, "dew_point_2m_mean");
  const radiation = column(response.daily, "shortwave_radiation_sum");
  const windMax = column(response.daily, "wind_speed_10m_max");
  const windDir = column(response.daily, "wind_direction_10m_dominant");

  // Latitude/longitude come back as the grid-cell centre, which is what the
  // numbers actually describe — not the coordinate we asked for.
  const latitude = response.latitude ?? Number.NaN;
  const longitude = response.longitude ?? Number.NaN;

  return days.map((data, i): WeatherPoint => {
    // Layers are still reported past the soil horizon, with null values, so a
    // consumer sees "no reading at 27-81cm" rather than a shrinking array.
    const solo =
      soilByDay.get(data) ??
      options.depths.map((d) => ({
        profundidadeTopoCm: d.topoCm,
        profundidadeBaseCm: d.baseCm,
        umidade: null,
        temperatura: null,
      }));

    return {
      latitude,
      longitude,
      data,
      tempMinC: at(tempMin, i),
      tempMaxC: at(tempMax, i),
      tempMediaC: at(tempMean, i),
      precipitacaoMm: at(precip, i),
      umidadeRelativaMediaPct: at(rhMean, i),
      umidadeRelativaMinPct: at(rhMin, i),
      pontoOrvalhoMedioC: at(dew, i),
      evapotranspiracaoMm: at(et0, i),
      radiacaoSolarMjM2: at(radiation, i),
      ventoVelocidadeMaxKmh: at(windMax, i),
      ventoDirecaoDominanteGraus: at(windDir, i),
      solo,
      fonte: options.fonte,
      modelo: options.modelo,
      tipo: options.tipo,
    };
  });
}

/** Depth of the crop root zone we average over. Most annual crops sit here. */
const ZONA_RADICULAR_CM = 30;

/**
 * Soil moisture over 0–30cm, weighted by how much of each layer falls inside
 * that band.
 *
 * This is the one number that means the same thing on both grids, which is why
 * it is a function over WeatherPoint rather than a field on it: the derivation
 * stays visible and testable instead of being smuggled into the type. A layer
 * straddling the boundary (ERA5's 28-100cm) contributes only its overlapping
 * 2cm, so it barely moves the result — as it should.
 */
export function umidadeZonaRadicular(point: WeatherPoint): number | null {
  let weighted = 0;
  let thickness = 0;
  for (const layer of point.solo) {
    if (layer.umidade === null) continue;
    const overlap =
      Math.min(layer.profundidadeBaseCm, ZONA_RADICULAR_CM) -
      Math.max(layer.profundidadeTopoCm, 0);
    if (overlap <= 0) continue;
    weighted += layer.umidade * overlap;
    thickness += overlap;
  }
  return thickness === 0 ? null : weighted / thickness;
}
