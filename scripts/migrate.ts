/**
 * Applies the committed SQL in ./drizzle to whichever database is configured.
 *
 * Drizzle ships a separate migrator per driver, so this is the one place that
 * has to branch. Running the same migration files against PGlite locally and
 * Postgres in production is what makes the local database trustworthy.
 */
import { getDb, PGLITE_DATA_DIR } from "../src/db/index";

const MIGRATIONS_FOLDER = "./drizzle";

async function main() {
  const url = process.env.DATABASE_URL;
  const db = await getDb();

  if (url) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("migrated: remote Postgres");
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log(`migrated: PGlite (${PGLITE_DATA_DIR})`);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
