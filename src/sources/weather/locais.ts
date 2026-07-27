/**
 * The curated catalogue of locations the weather page offers.
 *
 * Weather is keyed by coordinate, prices by praça — and those do not reduce to
 * one another. "São Paulo" has no single ET₀: Ribeirão Preto and Itapetininga
 * sit in different climates inside the same trading region. So this catalogue
 * exists instead of reusing the price layer's regions, and the two selectors
 * stay separate on purpose.
 *
 * `uf` is here only to group the dropdown. It is *not* a join key back to a
 * praça — treating it as one would reintroduce exactly the conflation above.
 *
 * Coordinates were resolved through Open-Meteo's own geocoding API
 * (geocoding-api.open-meteo.com) on 2026-07-27 rather than typed by hand, so
 * they match the grid cells the forecast endpoint will serve.
 */

export interface LocalClimatico {
  readonly id: string;
  readonly nome: string;
  /** Federal unit, for grouping the selector only. */
  readonly uf: "SP" | "PR";
  readonly lat: number;
  readonly lon: number;
}

/**
 * Chosen as agricultural reference points, not by population: Barretos for
 * cattle, Guarapuava and Ponta Grossa for wheat, Cascavel and Campo Mourão for
 * the soy/maize belt, Franca for coffee.
 */
export const LOCAIS: readonly LocalClimatico[] = [
  // — São Paulo —
  { id: "ribeirao-preto", nome: "Ribeirão Preto", uf: "SP", lat: -21.1775, lon: -47.81028 },
  { id: "franca", nome: "Franca", uf: "SP", lat: -20.53861, lon: -47.40083 },
  { id: "barretos", nome: "Barretos", uf: "SP", lat: -20.55722, lon: -48.56778 },
  { id: "aracatuba", nome: "Araçatuba", uf: "SP", lat: -21.20889, lon: -50.43278 },
  {
    id: "presidente-prudente",
    nome: "Presidente Prudente",
    uf: "SP",
    lat: -22.12556,
    lon: -51.38889,
  },
  {
    id: "sao-jose-do-rio-preto",
    nome: "São José do Rio Preto",
    uf: "SP",
    lat: -20.81972,
    lon: -49.37944,
  },
  { id: "campinas", nome: "Campinas", uf: "SP", lat: -22.90556, lon: -47.06083 },
  { id: "itapetininga", nome: "Itapetininga", uf: "SP", lat: -23.59167, lon: -48.05306 },

  // — Paraná —
  { id: "londrina", nome: "Londrina", uf: "PR", lat: -23.31028, lon: -51.16278 },
  { id: "maringa", nome: "Maringá", uf: "PR", lat: -23.42528, lon: -51.93861 },
  { id: "cascavel", nome: "Cascavel", uf: "PR", lat: -24.95583, lon: -53.45528 },
  { id: "ponta-grossa", nome: "Ponta Grossa", uf: "PR", lat: -25.095, lon: -50.16194 },
  { id: "guarapuava", nome: "Guarapuava", uf: "PR", lat: -25.39048, lon: -51.46541 },
  { id: "campo-mourao", nome: "Campo Mourão", uf: "PR", lat: -24.04309, lon: -52.37929 },
  { id: "toledo", nome: "Toledo", uf: "PR", lat: -24.71361, lon: -53.74306 },
  { id: "pato-branco", nome: "Pato Branco", uf: "PR", lat: -26.22861, lon: -52.67056 },
];

export const LOCAL_PADRAO = "ribeirao-preto";

export function findLocal(id: string | undefined): LocalClimatico | undefined {
  return LOCAIS.find((l) => l.id === id);
}

/** Resolves a requested id to a real location, falling back to the default. */
export function resolveLocal(id: string | undefined): LocalClimatico {
  const found = findLocal(id) ?? findLocal(LOCAL_PADRAO);
  if (found === undefined) throw new Error("Catálogo de locais está vazio.");
  return found;
}
