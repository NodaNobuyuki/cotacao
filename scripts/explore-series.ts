/**
 * Lists every série CEPEA publishes for every known product, with its
 * tabela_id — the input needed to decide what adapter.ts should map.
 *
 * Read-only: lists séries, downloads nothing.
 */
import {
  CepeaHybridScraperSource,
  pickPeriodicidade,
} from "../src/sources/cepea/source";
import { KNOWN_PRODUCTS } from "../src/sources/cepea/products";

const CADENCIA: Record<string, string> = {
  "1": "diária",
  "2": "semanal",
  "3": "mensal",
  "4": "anual",
};

async function main(): Promise<void> {
  const source = new CepeaHybridScraperSource({ logger: () => undefined });

  for (const produto of KNOWN_PRODUCTS) {
    try {
      const series = await source.listSeries(produto.id);
      console.log(`\n## ${produto.nome} (produto=${produto.id})`);
      for (const s of series) {
        const cadencia = CADENCIA[pickPeriodicidade(s.periodicidade)] ?? "?";
        console.log(
          `   [${cadencia.padEnd(7)}] tabela ${String(s.id).padStart(4)} | ${s.nome}`,
        );
      }
    } catch (error) {
      console.error(
        `\n## ${produto.nome}: FALHOU — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
