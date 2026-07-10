# Cotação do Campo

Painel de acompanhamento de preços de commodities agrícolas (soja, milho, trigo,
café e algodão) por praça de negociação.

> **Os preços exibidos são sintéticos.** Este projeto ainda não consome nenhuma
> fonte real de cotações. Os dados são gerados por simulação determinística e
> não reproduzem indicadores CEPEA/ESALQ nem servem para decisão comercial.

---

## Running it

No database server, no Docker, no signup:

```bash
npm install
npm run db:migrate   # creates ./.pglite and applies drizzle/*.sql
npm run db:seed      # ~7k synthetic quotes across 5 crops x 5 regions
npm run dev
```

To point at a real Postgres instead, set `DATABASE_URL` (see `.env.example`) and
re-run `db:migrate`.

| Command | Purpose |
| --- | --- |
| `npm test` | Unit tests for the domain layer |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Regenerate SQL migrations after editing the schema |
| `npm run db:reset` | Wipe the local PGlite store, migrate, and re-seed |

---

## Decisions

This README documents *why*, not *what*. The code says what.

### The data source is an interface, not a dependency

`src/sources/types.ts` defines a single `PriceSource`. The only implementation
today, `SyntheticPriceSource`, fabricates a deterministic random walk. A future
adapter for a licensed feed implements the same three methods and nothing
downstream changes — `scripts/seed.ts` differs by one line.

This matters because the hard problem in this product is **the right to
redistribute price data**, not the software. CEPEA publishes its indicators
publicly, but public visibility and a licence for systematic extraction and
commercial redistribution are different things. Treating the source as a seam
means that question can be answered late without blocking anything.

Every row carries the `source` that produced it, and the UI reads it back: if
synthetic data is present, the page says so. A dashboard that lies about its
provenance is worse than no dashboard.

### Variations are computed by date, never by array offset

The original prototype computed a weekly change as `series[n - 8]` — eight rows
back. That is only correct if the market trades seven days a week. It does not:
there are no quotes on weekends or holidays, so `n - 8` silently lands on a
different calendar date for every crop and every week of the year.

`src/domain/variation.ts` instead resolves *the last quote on or before the
cutoff date*. `src/domain/variation.test.ts` pins the difference so the offset
version cannot come back.

### The domain layer is pure

`src/domain/` imports neither React nor Drizzle. It is plain functions over
plain data, which is why it has real test coverage and why the sorting bug where
crops with no history floated to the top of a descending sort was caught by a
test rather than by a user.

### View state lives in the URL, not in React

Region, period, metric, chart selection and table sort are all query params
(`/?praca=MT&periodo=90&culturas=soja,cafe`). Consequences:

- every view is linkable, bookmarkable, and undoable with the back button;
- the segmented controls, chips and sort headers are `<Link>`s, so they need no
  client-side JavaScript at all;
- the server renders the correct page on first paint.

The only client components are the chart (pointer hover) and the region
`<select>` (a select cannot be a link).

### One schema, two drivers

`src/db/index.ts` picks PGlite when `DATABASE_URL` is unset and `postgres-js`
when it is set. Both run the *same* migrations from `drizzle/`, so the local
database is not a toy approximation of production. `git clone && npm install &&
npm run db:reset` gives a working dashboard in under a minute, and CI exercises
that exact path on every pull request.

### Organizations exist before there are users

`quotes` is a global fact table — the price of soybeans in Paraná on a given day
is the same for every customer, so scoping it per-tenant would only duplicate
rows. But `alerts` is tenant-scoped from the first migration, even though the
alerts UI does not exist yet. Retrofitting tenancy onto user-owned data is the
single most expensive migration in a SaaS; an unused `organizations` table costs
an afternoon.

### The charts are hand-written SVG

About fifty lines of geometry in `src/components/ComparisonChart.tsx`, matching
the original design exactly and adding nothing to the bundle. Each chart is
paired with a visually-hidden data table, because an unlabelled `<svg>` tells a
screen reader nothing.

---

## Layout

```
src/
  domain/        pure functions: series maths, variations, view model
  sources/       PriceSource interface + the synthetic implementation
  db/            schema, driver selection, queries, ingestion
  lib/           URL params, pt-BR formatting
  components/    presentational; only two are client components
  app/           the dashboard route
drizzle/         generated SQL migrations (committed)
scripts/         migrate, seed, reset
project/         the original HTML design prototype, kept for reference
docs/            handoff notes
```

---

## Status

**Phase 1 (done).** Schema and migrations, synthetic ingestion, the dashboard
grid, comparison chart, and sortable detail table — all rendered from real
database queries with URL-driven state.

**Next.**

1. Crop detail route `/culturas/[cropId]` with history and KPI tiles.
2. Server-evaluated alerts with cooldown and a delivery log. An alert that only
   fires while a browser tab is open is not an alert.
3. Auth and organization membership.
4. A real `PriceSource`, once the licensing question is settled.
5. ESLint and Prettier — deliberately deferred rather than half-configured.

Accessibility, provenance, and staleness are treated as Phase 1 concerns rather
than polish: prices that are quietly three days old are more dangerous than
prices that are visibly missing.
