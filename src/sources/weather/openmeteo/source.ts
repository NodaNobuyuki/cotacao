/**
 * OpenMeteoSource — the WeatherDataSource backed by Open-Meteo's free API.
 *
 * No key, no scraping, no browser: two JSON endpoints reached with plain
 * fetch. Forecast comes from api.open-meteo.com (ICON), history from
 * archive-api.open-meteo.com (ERA5 reanalysis). They answer with *different
 * soil depth grids*, which is why every point carries its `modelo`.
 *
 * Resilience mirrors the price layer: `fetchMany` isolates failures so one bad
 * coordinate cannot sink a batch. A single call still rejects — the caller
 * asked about one place and deserves to hear that it failed.
 */
import type { WeatherDataSource, WeatherPoint } from "../types";
import { TtlCache } from "./cache";
import {
  ARCHIVE_DEPTHS,
  ARCHIVE_URL,
  DAILY_VARS,
  FORECAST_DEPTHS,
  FORECAST_URL,
  hourlyVarsFor,
  MAX_FORECAST_DAYS,
  type DepthBand,
} from "./params";
import { parseOpenMeteo, type OpenMeteoResponse } from "./parse";

export const OPEN_METEO_FONTE = "Open-Meteo" as const;

/** Attribution required by Open-Meteo's CC BY 4.0 terms. */
export const OPEN_METEO_ATRIBUICAO =
  "Dados meteorológicos por Open-Meteo.com (CC BY 4.0)";

const MODELO_PREVISAO = "icon_seamless";
const MODELO_HISTORICO = "era5";

export interface OpenMeteoConfig {
  /** IANA zone the civil day is cut on. Days are local, not UTC. */
  readonly timezone?: string;
  /** Forecasts refresh upstream about hourly; 30min keeps renders cheap. */
  readonly forecastTtlMs?: number;
  /** Reanalysis of a closed day never changes — cache it far longer. */
  readonly historicalTtlMs?: number;
  readonly timeoutMs?: number;
  /** Retries apply to network faults and 5xx, never to a 400 (bad params). */
  readonly maxRetries?: number;
  readonly fetchImpl?: typeof fetch;
  readonly logger?: (message: string) => void;
}

const DEFAULTS = {
  timezone: "America/Sao_Paulo",
  forecastTtlMs: 30 * 60 * 1_000,
  historicalTtlMs: 24 * 60 * 60 * 1_000,
  timeoutMs: 15_000,
  maxRetries: 2,
} as const;

/** Raised when Open-Meteo rejects the request itself (HTTP 400 + reason). */
export class OpenMeteoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenMeteoError";
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class OpenMeteoSource implements WeatherDataSource {
  private readonly config: Required<Omit<OpenMeteoConfig, "logger" | "fetchImpl">>;
  private readonly doFetch: typeof fetch;
  private readonly log: (message: string) => void;
  private readonly cache: TtlCache<WeatherPoint[]>;

  constructor(config: OpenMeteoConfig = {}) {
    const { logger, fetchImpl, ...rest } = config;
    this.config = { ...DEFAULTS, ...rest };
    this.doFetch = fetchImpl ?? globalThis.fetch;
    this.log = logger ?? ((m: string): void => console.log(`[open-meteo] ${m}`));
    this.cache = new TtlCache<WeatherPoint[]>(
      Math.min(this.config.forecastTtlMs, this.config.historicalTtlMs),
    );
  }

  async getForecast(lat: number, lon: number, days: number): Promise<WeatherPoint[]> {
    assertCoords(lat, lon);
    const capped = Math.max(1, Math.min(Math.trunc(days), MAX_FORECAST_DAYS));
    if (capped !== Math.trunc(days)) {
      this.log(`forecast_days ${days} fora da faixa 1–${MAX_FORECAST_DAYS}; usando ${capped}`);
    }

    const url = this.buildUrl(FORECAST_URL, lat, lon, FORECAST_DEPTHS, {
      forecast_days: String(capped),
    });
    return this.load(url, FORECAST_DEPTHS, MODELO_PREVISAO, "previsao");
  }

  async getHistorical(
    lat: number,
    lon: number,
    dataInicio: string,
    dataFim: string,
  ): Promise<WeatherPoint[]> {
    assertCoords(lat, lon);
    assertIsoDate(dataInicio, "dataInicio");
    assertIsoDate(dataFim, "dataFim");
    if (dataInicio > dataFim) {
      throw new OpenMeteoError(
        `Intervalo invertido: dataInicio ${dataInicio} é posterior a dataFim ${dataFim}.`,
      );
    }

    const url = this.buildUrl(ARCHIVE_URL, lat, lon, ARCHIVE_DEPTHS, {
      start_date: dataInicio,
      end_date: dataFim,
    });
    return this.load(url, ARCHIVE_DEPTHS, MODELO_HISTORICO, "historico");
  }

  /**
   * Forecasts for many coordinates, where one failure is survivable.
   *
   * Sequential rather than parallel on purpose: Open-Meteo publishes no hard
   * rate limit but does ask for restraint, and a dashboard fanning out over
   * every município at once is exactly the pattern that earns one.
   */
  async fetchMany(
    locais: readonly { readonly id: string; readonly lat: number; readonly lon: number }[],
    days: number,
  ): Promise<Map<string, WeatherPoint[]>> {
    const results = new Map<string, WeatherPoint[]>();
    for (const local of locais) {
      try {
        results.set(local.id, await this.getForecast(local.lat, local.lon, days));
      } catch (error) {
        this.log(`local ${local.id} falhou: ${errorMessage(error)} — seguindo para o próximo`);
      }
    }
    return results;
  }

  private buildUrl(
    base: string,
    lat: number,
    lon: number,
    depths: readonly DepthBand[],
    extra: Record<string, string>,
  ): string {
    const query = new URLSearchParams({
      // Six decimals is ~0.1m, far past the 1–11km model resolution; trimming
      // keeps cache keys from fragmenting over meaningless precision.
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      daily: DAILY_VARS.join(","),
      hourly: hourlyVarsFor(depths).join(","),
      timezone: this.config.timezone,
      ...extra,
    });
    return `${base}?${query.toString()}`;
  }

  private async load(
    url: string,
    depths: readonly DepthBand[],
    modelo: string,
    tipo: "previsao" | "historico",
  ): Promise<WeatherPoint[]> {
    const cached = this.cache.get(url);
    if (cached !== undefined) return cached;

    const response = await this.request(url);
    const points = parseOpenMeteo(response, {
      depths,
      fonte: OPEN_METEO_FONTE,
      modelo,
      tipo,
    });
    this.cache.set(url, points);
    return points;
  }

  private async request(url: string): Promise<OpenMeteoResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url);

        // Open-Meteo reports parameter errors as 400 with {error, reason}.
        // Retrying a malformed query just wastes everyone's time.
        if (response.status === 400) {
          const body = (await response.json()) as OpenMeteoResponse;
          throw new OpenMeteoError(
            `Open-Meteo rejeitou a consulta: ${body.reason ?? "motivo não informado"}`,
          );
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const body = (await response.json()) as OpenMeteoResponse;
        if (body.error === true) {
          throw new OpenMeteoError(
            `Open-Meteo retornou erro: ${body.reason ?? "motivo não informado"}`,
          );
        }
        return body;
      } catch (error) {
        // A rejected query will be rejected identically on retry.
        if (error instanceof OpenMeteoError) throw error;
        lastError = error;
        if (attempt < this.config.maxRetries) {
          const backoffMs = 500 * 2 ** attempt;
          this.log(
            `tentativa ${attempt + 1} falhou (${errorMessage(error)}); nova tentativa em ${backoffMs}ms`,
          );
          await sleep(backoffMs);
        }
      }
    }

    throw new Error(
      `Open-Meteo indisponível após ${this.config.maxRetries + 1} tentativas: ${errorMessage(lastError)}`,
    );
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await this.doFetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

function assertCoords(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new OpenMeteoError(`Latitude inválida: ${lat}. Esperado entre -90 e 90.`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new OpenMeteoError(`Longitude inválida: ${lon}. Esperado entre -180 e 180.`);
  }
}

function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new OpenMeteoError(`${field} inválida: "${value}". Esperado YYYY-MM-DD.`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
