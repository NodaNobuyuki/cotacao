/**
 * Contracts for the weather ingestion layer.
 *
 * Mirrors the shape of the price layer (see sources/cepea/types.ts): the app
 * depends on `WeatherDataSource`, never on a concrete provider. Unlike prices,
 * a second implementation is already foreseen (Embrapa's ClimAPI), so the
 * interface lives here rather than inside the provider's folder.
 */

/**
 * One soil layer, at whatever depths the producing model actually uses.
 *
 * Depths are deliberately *not* normalised across providers. Open-Meteo's
 * forecast (ICON) reports 0-1, 1-3, 3-9, 9-27 and 27-81cm; its archive (ERA5)
 * reports 0-7, 7-28, 28-100 and 100-255cm. Collapsing those onto a shared
 * grid would mean inventing values the model never produced — so the raw grid
 * survives into the type, and `umidadeZonaRadicular` derives a comparable
 * number in the open, where it can be tested.
 */
export interface SoilLayer {
  readonly profundidadeTopoCm: number;
  readonly profundidadeBaseCm: number;
  /** Volumetric water content, m³/m³. */
  readonly umidade: number | null;
  /** °C. */
  readonly temperatura: number | null;
}

/** Whether a point was forecast or reconstructed from reanalysis. */
export type WeatherPointTipo = "previsao" | "historico";

/**
 * One day of weather at one point.
 *
 * Daily rather than hourly on purpose: it matches the cadence of the price
 * series it will eventually be crossed with, and ET₀ / precipitation are
 * natively daily quantities. Soil has no daily aggregate upstream and is
 * averaged from the 24 hourly samples — see `aggregateSoilByDay`.
 *
 * Every measurement is nullable because Open-Meteo genuinely returns nulls:
 * soil moisture stops at about D+7 even when 16 forecast days are requested.
 * An absent value is reported as absent rather than back-filled.
 */
export interface WeatherPoint {
  /** Grid-cell centre the provider actually served, not the requested point. */
  readonly latitude: number;
  readonly longitude: number;
  /** Civil day in the point's own timezone, "YYYY-MM-DD". */
  readonly data: string;

  readonly tempMinC: number | null;
  readonly tempMaxC: number | null;
  readonly tempMediaC: number | null;

  readonly precipitacaoMm: number | null;
  readonly umidadeRelativaMediaPct: number | null;
  readonly umidadeRelativaMinPct: number | null;
  readonly pontoOrvalhoMedioC: number | null;

  /** Reference evapotranspiration, FAO-56 Penman-Monteith, mm/day. */
  readonly evapotranspiracaoMm: number | null;
  readonly radiacaoSolarMjM2: number | null;

  readonly ventoVelocidadeMaxKmh: number | null;
  readonly ventoDirecaoDominanteGraus: number | null;

  /** Native grid: 5 layers on forecast (ICON), 4 on history (ERA5). */
  readonly solo: readonly SoilLayer[];

  /** Provider attribution, kept on every row for traceability. */
  readonly fonte: string;
  /**
   * Producing model, e.g. "icon_seamless" or "era5". Required, not optional:
   * soil layers are only comparable within one model, so a consumer that plots
   * forecast and history as one continuous series needs this to know it cannot.
   */
  readonly modelo: string;
  readonly tipo: WeatherPointTipo;
}

/**
 * The seam between weather ingestion and everything else. Dates are ISO
 * "YYYY-MM-DD"; implementations translate to whatever their upstream wants.
 */
export interface WeatherDataSource {
  /** `days` counts from today inclusive. Providers cap it; see the impl. */
  getForecast(lat: number, lon: number, days: number): Promise<WeatherPoint[]>;
  getHistorical(
    lat: number,
    lon: number,
    dataInicio: string,
    dataFim: string,
  ): Promise<WeatherPoint[]>;
}
