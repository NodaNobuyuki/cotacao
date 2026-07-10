/**
 * Fills a fresh database with a year of synthetic prices.
 *
 * This is the same code path a real ingestion job will use: it takes a
 * PriceSource and calls ingestRange. Swapping SyntheticPriceSource for a real
 * adapter changes this file by one line.
 */
import { getDb } from "../src/db/index";
import { ingestRange, syncReferenceData } from "../src/db/ingest";
import { organizations } from "../src/db/schema";
import { shiftIsoDays } from "../src/domain/series";
import { SyntheticPriceSource } from "../src/sources/synthetic";

const HISTORY_DAYS = 400;

async function main() {
  const db = await getDb();
  const source = new SyntheticPriceSource();

  const today = new Date().toISOString().slice(0, 10);
  const from = shiftIsoDays(today, -HISTORY_DAYS);

  await syncReferenceData(db, source);
  console.log(
    `reference data: ${source.listCrops().length} crops, ${source.listRegions().length} regions`,
  );

  const written = await ingestRange(db, source, from, today);
  console.log(`quotes: ${written} rows from ${from} to ${today} (${source.id})`);

  // A single tenant so alerts have somewhere to live in Phase 3.
  await db
    .insert(organizations)
    .values({ slug: "demo", name: "Demonstração" })
    .onConflictDoNothing({ target: organizations.slug });

  console.log("seed complete");
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
