/**
 * Drops the local PGlite data directory. Refuses to touch a remote database —
 * `db:reset` should never be the command that wipes staging.
 */
import { rmSync } from "node:fs";
import { PGLITE_DATA_DIR } from "../src/db/index";

if (process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is set. Refusing to reset a remote database; unset it to reset the local PGlite store.",
  );
  process.exit(1);
}

rmSync(PGLITE_DATA_DIR, { recursive: true, force: true });
console.log(`removed ${PGLITE_DATA_DIR}`);
