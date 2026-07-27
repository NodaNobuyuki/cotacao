/**
 * View state for the weather route, kept in the query string for the same
 * reason the price dashboard does it (see params.ts): every control is a link,
 * so the view is bookmarkable and the back button undoes it.
 *
 * Deliberately its own module rather than an extension of DashboardParams. The
 * two arms are keyed on different things — praça for prices, coordinate for
 * weather — and a shared params object would invite code that silently treats
 * one as the other.
 */
import { LOCAL_PADRAO, resolveLocal, type LocalClimatico } from "@/sources/weather";
import type { SearchParams } from "./params";

export const WEATHER_PARAM = {
  local: "local",
  janela: "janela",
} as const;

/** Forecast horizons offered. 7 is where soil moisture stops being modelled. */
export const JANELAS = [7, 16] as const;
export type Janela = (typeof JANELAS)[number];

export interface WeatherParams {
  readonly local: LocalClimatico;
  readonly janela: Janela;
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseWeatherParams(sp: SearchParams): WeatherParams {
  const janela = Number(one(sp[WEATHER_PARAM.janela]));
  return {
    local: resolveLocal(one(sp[WEATHER_PARAM.local])),
    janela: (JANELAS as readonly number[]).includes(janela) ? (janela as Janela) : 7,
  };
}

/** Serialises back to a URL, omitting anything sitting at its default. */
export function buildWeatherHref(
  base: WeatherParams,
  overrides: Partial<{ local: string; janela: Janela }> = {},
): string {
  const local = overrides.local ?? base.local.id;
  const janela = overrides.janela ?? base.janela;

  const q = new URLSearchParams();
  if (local !== LOCAL_PADRAO) q.set(WEATHER_PARAM.local, local);
  if (janela !== 7) q.set(WEATHER_PARAM.janela, String(janela));

  const query = q.toString();
  return query === "" ? "/clima" : `/clima?${query}`;
}
