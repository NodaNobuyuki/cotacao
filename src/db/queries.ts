import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "./index";
import { crops, quotes, regions } from "./schema";
import { shiftIsoDays } from "@/domain/series";
import type { CropMeta, Series } from "@/domain/types";

export interface RegionMeta {
  id: string;
  name: string;
}

export async function listRegions(): Promise<RegionMeta[]> {
  const db = await getDb();
  return db
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .orderBy(asc(regions.sortOrder));
}

export async function listCrops(): Promise<CropMeta[]> {
  const db = await getDb();
  return db
    .select({
      id: crops.id,
      name: crops.name,
      unit: crops.unit,
      colorHex: crops.colorHex,
    })
    .from(crops)
    .orderBy(asc(crops.sortOrder));
}

/** The most recent trading day for which any quote exists in a region. */
export async function latestQuoteDate(
  regionId: string,
): Promise<string | undefined> {
  const db = await getDb();
  const [row] = await db
    .select({ d: quotes.quoteDate })
    .from(quotes)
    .where(eq(quotes.regionId, regionId))
    .orderBy(desc(quotes.quoteDate))
    .limit(1);
  return row?.d;
}

/**
 * Every crop's price history for one region, over a trailing window.
 *
 * One query for all crops rather than one per crop: the row count is tiny and
 * a single ordered scan of the (region, crop, date) index beats N round trips.
 *
 * The window is widened by `lookbackPadDays` beyond what the caller wants to
 * display, so that a 7-day change computed at the left edge of the window still
 * has a prior quote to anchor against.
 */
export async function seriesByCrop(
  regionId: string,
  windowDays: number,
  lookbackPadDays = 45,
): Promise<Map<string, Series>> {
  const db = await getDb();
  const last = await latestQuoteDate(regionId);
  if (!last) return new Map();

  const from = shiftIsoDays(last, -(windowDays + lookbackPadDays));

  const rows = await db
    .select({
      cropId: quotes.cropId,
      date: quotes.quoteDate,
      // numeric arrives as a string; cast once here at the boundary.
      price: sql<number>`${quotes.price}::double precision`,
    })
    .from(quotes)
    .where(and(eq(quotes.regionId, regionId), gte(quotes.quoteDate, from)))
    .orderBy(asc(quotes.cropId), asc(quotes.quoteDate));

  const out = new Map<string, Series>();
  for (const r of rows) {
    const list = (out.get(r.cropId) as { date: string; price: number }[]) ?? [];
    if (list.length === 0) out.set(r.cropId, list as Series);
    list.push({ date: r.date, price: Number(r.price) });
  }
  return out;
}

/** Distinct sources contributing to a region, for the provenance banner. */
export async function sourcesForRegion(regionId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ source: quotes.source })
    .from(quotes)
    .where(eq(quotes.regionId, regionId));
  return rows.map((r) => r.source);
}

/**
 * One crop's price history in one region, over a trailing window.
 *
 * Deliberately not `seriesByCrop(...).get(cropId)`: that scans every crop in
 * the region and discards all but one, and its window is sized for the
 * dashboard's needs, not the detail page's (up to 365 days). This seeks the
 * (regionId, cropId, quoteDate) index directly.
 */
export async function quotesForCrop(
  regionId: string,
  cropId: string,
  windowDays: number,
  lookbackPadDays = 45,
): Promise<Series> {
  const db = await getDb();
  const last = await latestQuoteDate(regionId);
  if (!last) return [];

  const from = shiftIsoDays(last, -(windowDays + lookbackPadDays));

  const rows = await db
    .select({
      date: quotes.quoteDate,
      price: sql<number>`${quotes.price}::double precision`,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.regionId, regionId),
        eq(quotes.cropId, cropId),
        gte(quotes.quoteDate, from),
      ),
    )
    .orderBy(asc(quotes.quoteDate));

  return rows.map((r) => ({ date: r.date, price: Number(r.price) }));
}

/**
 * Regions that carry at least one quote for this crop. CEPEA does not
 * publish every crop everywhere (no trigo for São Paulo, no café for
 * Paraná), so the crop detail page's region picker is scoped to this set
 * rather than offering a region that would render nothing.
 */
export async function regionsForCrop(cropId: string): Promise<RegionMeta[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({
      id: regions.id,
      name: regions.name,
      sortOrder: regions.sortOrder,
    })
    .from(quotes)
    .innerJoin(regions, eq(quotes.regionId, regions.id))
    .where(eq(quotes.cropId, cropId))
    .orderBy(asc(regions.sortOrder));
  return rows.map((r) => ({ id: r.id, name: r.name }));
}
