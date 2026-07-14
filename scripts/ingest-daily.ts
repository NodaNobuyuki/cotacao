/**
 * Daily ingestion job: CEPEA → database.
 *
 *   npm run ingest:daily            # last 15 days
 *   npm run ingest:daily -- --dias 400   # backfill
 *
 * Re-ingesting a trailing window rather than only "yesterday" is deliberate:
 * CEPEA revises indicators after publication, and a run that fails on Tuesday
 * must be repaired by Wednesday's run without anyone noticing. `ingestRange`
 * is idempotent — the unique index on (crop, region, date, source) turns the
 * overlap into an update.
 *
 * Requires a headed browser: the Cloudflare challenge does not clear headless
 * (verified). On a server, run it under a virtual display (Xvfb).
 */
import { parseArgs } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { ingestRange, syncReferenceData } from "../src/db/ingest";
import { quotes } from "../src/db/schema";
import { shiftIsoDays } from "../src/domain/series";
import { CepeaPriceSource } from "../src/sources/cepea/adapter";

const DEFAULT_LOOKBACK_DAYS = 15;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { dias: { type: "string" } },
  });
  const lookback = Number(values.dias ?? DEFAULT_LOOKBACK_DAYS);
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new Error(`--dias inválido: ${String(values.dias)}`);
  }

  const startedAt = Date.now();
  const db = await getDb();
  const source = new CepeaPriceSource();

  const today = new Date().toISOString().slice(0, 10);
  const from = shiftIsoDays(today, -lookback);

  await syncReferenceData(db, source);
  const written = await ingestRange(db, source, from, today);

  if (written === 0) {
    // Silence here would look identical to success on the dashboard, so fail
    // loudly: a non-zero exit is what the scheduler reports as a failed run.
    console.error(
      `nenhuma cotação ingerida entre ${from} e ${today} — verifique o challenge Cloudflare`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `${written} cotações (${source.id}) de ${from} a ${today} em ${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
  await warnIfSyntheticRemains(db);
}

/**
 * Synthetic and CEPEA rows can coexist for the same crop/region/date because
 * `source` is part of the unique key — and then the dashboard would plot both
 * as duplicate points on one line. Real data has landed, so the fake data now
 * has to go; deleting it is the user's call, not this job's.
 */
async function warnIfSyntheticRemains(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<void> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotes)
    .where(eq(quotes.source, "synthetic"));
  const count = row?.n ?? 0;
  if (count === 0) return;

  console.warn(
    `\nATENÇÃO: ${count} cotações sintéticas ainda no banco. Elas se sobrepõem\n` +
      `aos dados reais nas mesmas praças e o gráfico plotaria as duas séries.\n` +
      `Remova-as com: npm run db:drop-synthetic`,
  );
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
