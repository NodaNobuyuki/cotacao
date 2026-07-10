import { sql } from "drizzle-orm";
import type { Db } from "./index";
import { crops, quotes, regions } from "./schema";
import type { PriceSource } from "@/sources/types";

/** `excluded.<col>` — the row Postgres rejected, available inside DO UPDATE. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

/** Chunked so a full backfill does not build one enormous INSERT statement. */
const INSERT_CHUNK = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Upserts the source's crop and region catalogue. Safe to re-run. */
export async function syncReferenceData(
  db: Db,
  source: PriceSource,
): Promise<void> {
  const cropRows = source.listCrops().map((c, i) => ({ ...c, sortOrder: i }));
  const regionRows = source.listRegions().map((r, i) => ({ ...r, sortOrder: i }));

  await db
    .insert(crops)
    .values(cropRows)
    .onConflictDoUpdate({
      target: crops.id,
      set: {
        name: sqlExcluded("name"),
        unit: sqlExcluded("unit"),
        colorHex: sqlExcluded("color_hex"),
        sortOrder: sqlExcluded("sort_order"),
      },
    });

  await db
    .insert(regions)
    .values(regionRows)
    .onConflictDoUpdate({
      target: regions.id,
      set: { name: sqlExcluded("name"), sortOrder: sqlExcluded("sort_order") },
    });
}

/**
 * Pulls a date range from `source` and writes it.
 *
 * Idempotent by construction: the unique index on
 * (crop, region, date, source) turns a re-run into an update, so a retried or
 * overlapping backfill converges rather than duplicating.
 *
 * Returns the number of rows written.
 */
export async function ingestRange(
  db: Db,
  source: PriceSource,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const raw = await source.fetchQuotes(fromIso, toIso);
  if (raw.length === 0) return 0;

  const rows = raw.map((r) => ({
    cropId: r.cropId,
    regionId: r.regionId,
    quoteDate: r.date,
    // numeric columns round-trip as strings; keep money out of float64.
    price: r.price.toFixed(4),
    source: source.id,
  }));

  for (const batch of chunk(rows, INSERT_CHUNK)) {
    await db
      .insert(quotes)
      .values(batch)
      .onConflictDoUpdate({
        target: [quotes.cropId, quotes.regionId, quotes.quoteDate, quotes.source],
        set: { price: sqlExcluded("price"), ingestedAt: new Date() },
      });
  }
  return rows.length;
}
