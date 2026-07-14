/**
 * CepeaPriceSource — adapts the CEPEA scraper to the app's `PriceSource`.
 *
 * Two interfaces meet here on purpose. The scraper speaks CEPEA's language
 * (produto ids, séries, praças); the dashboard speaks crops and regions. This
 * file is the only place that knows both, so when CEPEA's paid API replaces
 * the scraper, only the constructor argument changes.
 *
 * Mapping rule: exactly one série per (crop, region). The quotes table is
 * unique on (crop, region, date, source), so mapping two séries onto the same
 * pair would make them silently overwrite each other. That is why the boi
 * gordo "Média a Prazo" série is deliberately not mapped — it is a second
 * pricing methodology for the same animal in the same state, not another
 * market.
 */
import type {
  CropDefinition,
  PriceSource,
  RawQuote,
  RegionDefinition,
} from "../types";
import { CepeaHybridScraperSource } from "./source";
import type { PriceDataSource } from "./types";

/** Regions here are CEPEA's actual praças, not a tidy list of UFs. */
const REGIONS: readonly RegionDefinition[] = [
  { id: "SP", name: "São Paulo" },
  { id: "PR", name: "Paraná" },
  { id: "PRG", name: "Paranaguá (porto)" },
];

/** Units are the ones CEPEA states in the exported sheets. */
const CROPS: readonly CropDefinition[] = [
  { id: "boi-gordo", name: "Boi gordo", unit: "R$/@", colorHex: "#8C5A3B" },
  { id: "soja", name: "Soja", unit: "R$/saca 60kg", colorHex: "#C57B2C" },
  { id: "milho", name: "Milho", unit: "R$/saca 60kg", colorHex: "#D9A520" },
];

interface SerieMapping {
  /** Form id posted as `produto=`. */
  readonly produtoId: string;
  /** CEPEA's tabela_id — the série's stable key. */
  readonly serieId: string;
  readonly cropId: string;
  readonly regionId: string;
}

/**
 * Confirmed against live séries on 2026-07-13. A série CEPEA renames still
 * maps correctly, because the key is the numeric tabela_id, not the name.
 */
const SERIES: readonly SerieMapping[] = [
  // "INDICADOR DO BOI GORDO CEPEA/ESALQ" — the São Paulo reference market.
  { produtoId: "1,2", serieId: "2", cropId: "boi-gordo", regionId: "SP" },
  // "INDICADOR DA SOJA CEPEA/ESALQ - PARANÁ"
  { produtoId: "27,28", serieId: "12", cropId: "soja", regionId: "PR" },
  // "INDICADOR DA SOJA CEPEA/ESALQ - PARANAGUÁ" — the export port.
  { produtoId: "27,28", serieId: "92", cropId: "soja", regionId: "PRG" },
  // "INDICADOR DO MILHO ESALQ/BM&FBOVESPA" — Campinas (SP) reference.
  { produtoId: "25,26", serieId: "77", cropId: "milho", regionId: "SP" },
];

export class CepeaPriceSource implements PriceSource {
  readonly id = "cepea";
  readonly isSynthetic = false;

  private readonly scraper: PriceDataSource;
  private readonly log: (message: string) => void;

  constructor(
    scraper: PriceDataSource = new CepeaHybridScraperSource(),
    logger: (message: string) => void = (m) => console.log(`[cepea] ${m}`),
  ) {
    this.scraper = scraper;
    this.log = logger;
  }

  listCrops(): readonly CropDefinition[] {
    return CROPS;
  }

  listRegions(): readonly RegionDefinition[] {
    return REGIONS;
  }

  async fetchQuotes(fromIso: string, toIso: string): Promise<RawQuote[]> {
    const quotes: RawQuote[] = [];

    for (const produtoId of distinctProdutoIds()) {
      try {
        const points = await this.scraper.fetch(produtoId, fromIso, toIso);
        for (const point of points) {
          const mapping = SERIES.find((s) => s.serieId === point.serieId);
          // Products carry séries we do not track (e.g. boi "Média a Prazo").
          if (mapping === undefined) continue;
          quotes.push({
            cropId: mapping.cropId,
            regionId: mapping.regionId,
            date: point.data,
            price: point.valor,
          });
        }
      } catch (error) {
        // One dead product must not cost us the products that did respond.
        this.log(
          `produto ${produtoId} falhou: ${error instanceof Error ? error.message : String(error)} — seguindo`,
        );
      }
    }
    return quotes;
  }
}

function distinctProdutoIds(): string[] {
  return [...new Set(SERIES.map((s) => s.produtoId))];
}
