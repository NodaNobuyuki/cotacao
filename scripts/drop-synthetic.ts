/**
 * Deletes the synthetic demo data, leaving real (CEPEA) rows untouched.
 *
 * Run once after the first successful real ingestion. Kept as an explicit,
 * separate command rather than a side effect of the daily job: deleting rows
 * is not something an unattended cron should decide to do.
 *
 * Also drops crops and regions left with no quotes at all — the synthetic
 * source published five crops across five UFs, and the ones CEPEA does not
 * cover would otherwise linger in the UI as chips that select nothing.
 */
import { eq, notInArray, sql } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { crops, quotes, regions } from "../src/db/schema";

async function main(): Promise<void> {
  const db = await getDb();

  const deleted = await db
    .delete(quotes)
    .where(eq(quotes.source, "synthetic"))
    .returning({ id: quotes.id });
  console.log(`${deleted.length} cotações sintéticas removidas.`);

  const withQuotes = await db
    .selectDistinct({ cropId: quotes.cropId, regionId: quotes.regionId })
    .from(quotes);
  const liveCrops = [...new Set(withQuotes.map((r) => r.cropId))];
  const liveRegions = [...new Set(withQuotes.map((r) => r.regionId))];

  if (liveCrops.length === 0) {
    console.warn("Nenhuma cotação restante — catálogo preservado por segurança.");
    return;
  }

  const orphanCrops = await db
    .delete(crops)
    .where(notInArray(crops.id, liveCrops))
    .returning({ id: crops.id });
  const orphanRegions = await db
    .delete(regions)
    .where(notInArray(regions.id, liveRegions))
    .returning({ id: regions.id });

  console.log(
    `catálogo: ${orphanCrops.length} culturas e ${orphanRegions.length} praças sem cotações removidas` +
      (orphanCrops.length + orphanRegions.length > 0
        ? ` (${[...orphanCrops, ...orphanRegions].map((r) => r.id).join(", ")})`
        : ""),
  );

  const [remaining] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotes);
  console.log(`${remaining?.n ?? 0} cotações reais no banco.`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
