/**
 * Derived readings the weather page shows, kept out of the components so the
 * arithmetic is testable on its own.
 *
 * Everything here degrades to null rather than guessing. A forecast that runs
 * past the soil horizon has genuinely no soil reading, and a card showing "0
 * mm" for "we do not know" would be worse than a card showing a dash.
 */
import { umidadeZonaRadicular } from "../sources/weather/openmeteo/parse";
import type { WeatherPoint } from "../sources/weather/types";

/** Total rainfall over the window, and how many days actually reported. */
export function chuvaAcumulada(points: readonly WeatherPoint[]): {
  readonly mm: number | null;
  readonly diasComDado: number;
} {
  const present = points
    .map((p) => p.precipitacaoMm)
    .filter((v): v is number => v !== null);
  return {
    mm: present.length === 0 ? null : present.reduce((a, b) => a + b, 0),
    diasComDado: present.length,
  };
}

/** Total reference evapotranspiration over the window. */
export function et0Acumulada(points: readonly WeatherPoint[]): number | null {
  const present = points
    .map((p) => p.evapotranspiracaoMm)
    .filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

/**
 * Rain minus reference evapotranspiration — the water balance a producer
 * actually feels. Negative means the crop is losing more than it receives.
 *
 * Only computed over days where *both* are known: summing a full rain series
 * against a partial ET₀ series would flatter the balance.
 */
export function balancoHidrico(points: readonly WeatherPoint[]): number | null {
  const paired = points.filter(
    (p) => p.precipitacaoMm !== null && p.evapotranspiracaoMm !== null,
  );
  if (paired.length === 0) return null;
  return paired.reduce(
    (acc, p) => acc + (p.precipitacaoMm ?? 0) - (p.evapotranspiracaoMm ?? 0),
    0,
  );
}

/** The next day expected to receive meaningful rain, if any. */
export function proximaChuva(
  points: readonly WeatherPoint[],
  limiarMm = 1,
): WeatherPoint | undefined {
  return points.find((p) => (p.precipitacaoMm ?? 0) >= limiarMm);
}

/**
 * Days whose conditions suit spraying, by the rule of thumb Brazilian
 * agronomists use: wind under 10 km/h, relative humidity above 55%, and no
 * rain that would wash the application off.
 *
 * This reads daily aggregates, so it answers "is this day plausible" and not
 * "spray at 07:00". Wind max over a whole day is a deliberately conservative
 * proxy — a day that never exceeds 10 km/h is genuinely calm. Calling the
 * window precisely would need the hourly series, which this layer does not
 * fetch; the UI must not imply more precision than that.
 */
export function diasParaPulverizacao(
  points: readonly WeatherPoint[],
): readonly WeatherPoint[] {
  return points.filter(
    (p) =>
      p.ventoVelocidadeMaxKmh !== null &&
      p.ventoVelocidadeMaxKmh <= 10 &&
      p.umidadeRelativaMediaPct !== null &&
      p.umidadeRelativaMediaPct >= 55 &&
      (p.precipitacaoMm ?? 0) < 1,
  );
}

/** Root-zone soil moisture for the first day that has one. */
export function umidadeSoloAtual(points: readonly WeatherPoint[]): number | null {
  for (const point of points) {
    const value = umidadeZonaRadicular(point);
    if (value !== null) return value;
  }
  return null;
}

/** The last day of the window for which soil moisture was modelled at all. */
export function horizonteSolo(points: readonly WeatherPoint[]): string | null {
  let last: string | null = null;
  for (const point of points) {
    if (umidadeZonaRadicular(point) !== null) last = point.data;
  }
  return last;
}

/** Compass point for a wind bearing in degrees. */
export function rosaDosVentos(graus: number | null): string {
  if (graus === null || !Number.isFinite(graus)) return "—";
  const pontos = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  const index = Math.round(((graus % 360) + 360) % 360 / 45) % 8;
  return pontos[index] ?? "—";
}
