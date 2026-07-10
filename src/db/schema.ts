import {
  bigserial,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Tenancy note
 * ------------
 * Market data (crops, regions, quotes) is a global fact table: the price of
 * soybeans in Paraná on a given day is the same for every customer, so scoping
 * it per-organization would only duplicate rows and slow reads.
 *
 * Organizations exist from this first migration so that *user-owned* data —
 * alerts today, watchlists and dashboards later — is tenant-scoped from day
 * one. Retrofitting tenancy onto that data is the expensive migration; adding
 * an unused `organizations` table is nearly free.
 */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** An agricultural commodity tracked by the dashboard. */
export const crops = pgTable("crops", {
  /** Stable human-readable key, e.g. "soja". Used in URLs. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Trading unit, e.g. "R$/saca 60kg". */
  unit: text("unit").notNull(),
  /** Hex colour used consistently across chart, chips, and cards. */
  colorHex: text("color_hex").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** A trading location ("praça de negociação"). */
export const regions = pgTable("regions", {
  /** Two-letter UF code, e.g. "PR". Used in URLs. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * One published price for one crop, in one region, on one trading day.
 *
 * There is no row for weekends or holidays — the source simply does not
 * publish. Anything computing a "7 day change" must therefore look up a date,
 * never an array offset. See src/domain/variation.ts.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cropId: text("crop_id")
      .notNull()
      .references(() => crops.id, { onDelete: "cascade" }),
    regionId: text("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "cascade" }),
    quoteDate: date("quote_date").notNull(),
    /** numeric, not float: money must not round-trip through binary floats. */
    price: numeric("price", { precision: 12, scale: 4 }).notNull(),
    /** Which PriceSource produced this row. See src/sources/. */
    source: text("source").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Makes ingestion idempotent: re-running a backfill updates in place.
    uniqueIndex("quotes_crop_region_date_source_uq").on(
      t.cropId,
      t.regionId,
      t.quoteDate,
      t.source,
    ),
    // The dashboard's only hot query: one region, N crops, ordered by date.
    index("quotes_region_crop_date_idx").on(t.regionId, t.cropId, t.quoteDate),
  ],
);

export const alertDirection = pgEnum("alert_direction", ["above", "below"]);

/**
 * Tenant-scoped. Evaluated server-side after each ingest (Phase 3), never in
 * the browser — an alert that only fires while a tab is open is not an alert.
 */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cropId: text("crop_id")
      .notNull()
      .references(() => crops.id, { onDelete: "cascade" }),
    regionId: text("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "cascade" }),
    direction: alertDirection("direction").notNull(),
    target: numeric("target", { precision: 12, scale: 4 }).notNull(),
    /** Suppresses re-notification while a price hovers around the threshold. */
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("alerts_org_idx").on(t.orgId)],
);

export type Crop = typeof crops.$inferSelect;
export type Region = typeof regions.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
