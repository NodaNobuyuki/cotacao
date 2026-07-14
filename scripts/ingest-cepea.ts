/**
 * Standalone runner for the CEPEA ingestion layer — no DB, no scheduler.
 *
 *   npx tsx scripts/ingest-cepea.ts
 *   npx tsx scripts/ingest-cepea.ts --produto boi-gordo --inicio 2026-06-01 --fim 2026-07-10
 *   npx tsx scripts/ingest-cepea.ts --produto 1,2 --headless
 *
 * Defaults: all known products, last 30 days, headed browser (Cloudflare
 * usually refuses headless ones). Designed for a daily cron, not per-request.
 */
import { parseArgs } from "node:util";
import {
  CepeaHybridScraperSource,
  DEFAULT_PRODUCT_SLUGS,
  findProduct,
  type PricePoint,
} from "../src/sources/cepea";

interface CliOptions {
  readonly produtoIds: readonly string[];
  readonly inicio: string;
  readonly fim: string;
  readonly headless: boolean;
}

function parseCli(): CliOptions {
  const { values } = parseArgs({
    options: {
      produto: { type: "string", multiple: true },
      inicio: { type: "string" },
      fim: { type: "string" },
      headless: { type: "boolean", default: false },
    },
  });

  const hoje = new Date();
  const inicioPadrao = new Date(hoje.getTime() - 30 * 86_400_000);

  const requested =
    values.produto === undefined || values.produto.length === 0
      ? DEFAULT_PRODUCT_SLUGS
      : values.produto;
  // Unknown args pass through as raw form ids, so a new product can be tried
  // without editing the catalog first.
  const produtoIds = requested.map((arg) => findProduct(arg)?.id ?? arg);

  return {
    produtoIds,
    inicio: values.inicio ?? inicioPadrao.toISOString().slice(0, 10),
    fim: values.fim ?? hoje.toISOString().slice(0, 10),
    headless: values.headless ?? false,
  };
}

async function main(): Promise<void> {
  const options = parseCli();
  const source = new CepeaHybridScraperSource({ headless: options.headless });

  console.log(
    `Ingestão CEPEA: produtos [${options.produtoIds.join(" | ")}] de ${options.inicio} a ${options.fim}\n`,
  );

  let total = 0;
  let falhas = 0;
  for (const produtoId of options.produtoIds) {
    try {
      const points = await source.fetch(produtoId, options.inicio, options.fim);
      total += points.length;
      printSummary(produtoId, points);
    } catch (error) {
      // A whole product can fail (e.g. bad id) without killing the batch.
      falhas += 1;
      console.error(
        `✗ produto ${produtoId} falhou: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`\nTotal: ${total} cotações. Fonte: CEPEA/ESALQ (CC BY-NC 4.0).`);
  if (falhas === options.produtoIds.length && options.produtoIds.length > 0) {
    process.exitCode = 1;
  }
}

function printSummary(produtoId: string, points: readonly PricePoint[]): void {
  if (points.length === 0) {
    console.log(`— produto ${produtoId}: nenhuma cotação no período.`);
    return;
  }
  const series = new Map<string, PricePoint[]>();
  for (const point of points) {
    const existing = series.get(point.produto);
    if (existing === undefined) series.set(point.produto, [point]);
    else existing.push(point);
  }
  for (const [nome, rows] of series) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (first === undefined || last === undefined) continue;
    console.log(
      `✓ ${nome} [${first.unidade || "unidade n/d"}${first.praca ? `, ${first.praca}` : ""}]: ` +
        `${rows.length} cotações de ${first.data} (R$ ${first.valor}) a ${last.data} (R$ ${last.valor})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
