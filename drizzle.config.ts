import type { Config } from "drizzle-kit";

// Only `drizzle-kit generate` is used, which diffs the schema against the
// committed SQL in ./drizzle and needs no live database. Migrations are applied
// by scripts/migrate.ts so that PGlite and real Postgres share one code path.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
} satisfies Config;
