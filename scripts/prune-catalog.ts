/**
 * Removes crops and praças that the source no longer publishes.
 *
 * `syncReferenceData` only ever upserts, so a crop or praça dropped from the
 * catalogue lingers in the database — with its quotes — and keeps showing up
 * in the UI. This prunes them (the FK cascade takes the quotes with them).
 *
 * Deliberately a separate, explicit command: deleting real price history is
 * not a decision an unattended cron should be making.
 */
import { notInArray } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { crops, regions } from "../src/db/schema";
import { CepeaPriceSource } from "../src/sources/cepea/adapter";

async function main(): Promise<void> {
  const db = await getDb();
  const source = new CepeaPriceSource();

  const keepCrops = source.listCrops().map((c) => c.id);
  const keepRegions = source.listRegions().map((r) => r.id);

  const droppedRegions = await db
    .delete(regions)
    .where(notInArray(regions.id, keepRegions))
    .returning({ id: regions.id });
  const droppedCrops = await db
    .delete(crops)
    .where(notInArray(crops.id, keepCrops))
    .returning({ id: crops.id });

  const names = [...droppedRegions, ...droppedCrops].map((r) => r.id);
  console.log(
    names.length === 0
      ? "nada a remover: banco já reflete o catálogo."
      : `removidos (com suas cotações): ${names.join(", ")}`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
