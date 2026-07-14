/**
 * Contracts for the CEPEA ingestion layer.
 *
 * This module is deliberately self-contained: nothing here imports from the
 * rest of the app, and the app never imports the scraper directly — only this
 * interface. Swapping the hybrid scraper for CEPEA's paid API later means
 * writing one new class, not touching callers.
 */

/** Attribution required by CEPEA's CC BY-NC 4.0 licence; stored on every row. */
export const CEPEA_FONTE = "CEPEA/ESALQ" as const;

/** A single price observation as published by CEPEA. */
export interface PricePoint {
  /** Opaque form id as posted to CEPEA (e.g. "1,2" = boi gordo). */
  readonly produtoId: string;
  /** CEPEA's `tabela_id` for the série — the stable key to map a série on. */
  readonly serieId: string;
  /** Series name as CEPEA publishes it, e.g. "INDICADOR DO BOI GORDO CEPEA/ESALQ". */
  readonly produto: string;
  /** Calendar day, "YYYY-MM-DD". */
  readonly data: string;
  /** Price in BRL. */
  readonly valor: number;
  /** Price in USD when the sheet includes the dollar column. */
  readonly valorUsd?: number;
  /** e.g. "R$/@", "R$/saca de 60 kg". Empty when the sheet does not state it. */
  readonly unidade: string;
  /** Market/region qualifier when the series name carries one (e.g. "PARANÁ"). */
  readonly praca: string;
  readonly fonte: typeof CEPEA_FONTE;
}

/**
 * The seam between ingestion and everything else. Date arguments are ISO
 * "YYYY-MM-DD"; implementations translate to whatever their upstream wants.
 */
export interface PriceDataSource {
  fetch(
    produtoId: string,
    dataInicio: string,
    dataFim: string,
  ): Promise<PricePoint[]>;
}
