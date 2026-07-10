/** A price as published by a source, before it is stored. */
export interface RawQuote {
  readonly cropId: string;
  readonly regionId: string;
  /** "YYYY-MM-DD" */
  readonly date: string;
  readonly price: number;
}

export interface CropDefinition {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly colorHex: string;
}

export interface RegionDefinition {
  readonly id: string;
  readonly name: string;
}

/**
 * The single seam between this application and wherever prices come from.
 *
 * Today the only implementation fabricates data (see synthetic.ts). A future
 * CepeaPriceSource — or a licensed vendor feed, or a cooperative's own
 * spreadsheet — implements this same interface and nothing downstream changes.
 *
 * Implementations must be idempotent and side-effect free: `fetchQuotes` may be
 * called repeatedly for overlapping ranges during backfill and retry.
 */
export interface PriceSource {
  /** Stored on every row it produces, so provenance survives ingestion. */
  readonly id: string;
  /** True when the data is fabricated and must be labelled as such in the UI. */
  readonly isSynthetic: boolean;

  listCrops(): readonly CropDefinition[];
  listRegions(): readonly RegionDefinition[];

  /** Trading days only. Never returns rows for days the market was closed. */
  fetchQuotes(fromIso: string, toIso: string): Promise<RawQuote[]>;
}
