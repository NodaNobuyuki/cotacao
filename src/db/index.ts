import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * One schema, two drivers.
 *
 * - No DATABASE_URL  -> PGlite, an embedded WASM build of Postgres writing to
 *   ./.pglite. Local development and CI need no daemon and no container.
 * - DATABASE_URL set  -> postgres-js against a real server (Neon, RDS, ...).
 *
 * Both speak the same SQL, so Drizzle's query builder is identical either way
 * and only this module knows which one is live.
 */
export type Db = PgliteDatabase<typeof schema>;

export const PGLITE_DATA_DIR = ".pglite";

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const [{ drizzle }, postgres] = await Promise.all([
      import("drizzle-orm/postgres-js"),
      import("postgres").then((m) => m.default),
    ]);
    const client = postgres(url, { max: 10 });
    return drizzle(client, { schema }) as unknown as Db;
  }

  const [{ drizzle }, { PGlite }] = await Promise.all([
    import("drizzle-orm/pglite"),
    import("@electric-sql/pglite"),
  ]);
  const client = new PGlite(PGLITE_DATA_DIR);
  return drizzle(client, { schema });
}

// Next.js dev server re-evaluates modules on hot reload. Without this cache
// each reload would open a second PGlite instance over the same data dir.
const globalForDb = globalThis as unknown as { __dbPromise?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__dbPromise ??= createDb();
  return globalForDb.__dbPromise;
}

export { schema };
