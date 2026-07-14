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

/** Scoped to the two praças the dashboard covers. */
const REGIONS: readonly RegionDefinition[] = [
  { id: "SP", name: "São Paulo" },
  { id: "PR", name: "Paraná" },
];

/**
 * Units are not guesses: each one is the unit CEPEA itself states in the
 * exported sheet, read back from the parser. Trigo really is priced per tonne
 * while everything else is per saca/arroba/kg, and bezerro is per head.
 */
const CROPS: readonly CropDefinition[] = [
  { id: "soja", name: "Soja", unit: "R$/saca 60kg", colorHex: "#C57B2C" },
  { id: "milho", name: "Milho", unit: "R$/saca 60kg", colorHex: "#D9A520" },
  { id: "boi-gordo", name: "Boi gordo", unit: "R$/@", colorHex: "#A34A3C" },
  { id: "cafe", name: "Café arábica", unit: "R$/saca 60kg", colorHex: "#6F4436" },
  { id: "trigo", name: "Trigo", unit: "R$/tonelada", colorHex: "#B08247" },
  { id: "suino", name: "Suíno vivo", unit: "R$/kg", colorHex: "#C2777F" },
  { id: "frango", name: "Frango congelado", unit: "R$/kg", colorHex: "#5E8C6A" },
  { id: "bezerro", name: "Bezerro", unit: "R$/cabeça", colorHex: "#D08C6A" },
];

interface SerieMapping {
  /** Form id posted as `produto=`. */
  readonly produtoId: string;
  /** CEPEA's tabela_id — the série's stable key. Not always numeric. */
  readonly serieId: string;
  readonly cropId: string;
  readonly regionId: string;
}

/**
 * Confirmed against live séries on 2026-07-14, and deliberately limited to
 * séries CEPEA publishes *daily* — the dashboard's "variação no dia / 7d / 30d"
 * only means what it says on a daily series. That rules out, for now:
 *
 *  - leite ao produtor (SP e PR): mensal. Muito relevante ao produtor, mas a
 *    coluna "Dia" mostraria variação mês-a-mês. Precisa de UI ciente de
 *    cadência antes de entrar.
 *  - feijão (CEPEA/CNA): publicado de forma irregular — 2 cotações em 13 dias.
 *  - algodão, arroz, açúcar, etanol, mandioca, tilápia: ou a praça não é SP/PR,
 *    ou o preço é de usina/indústria, não do produtor.
 *
 * Coverage is asymmetric by nature: CEPEA publishes soja e trigo no Paraná, e
 * boi/café/milho em São Paulo. O painel já esconde cultura sem cotação na praça.
 */
const SERIES: readonly SerieMapping[] = [
  // — São Paulo —
  // "INDICADOR DO BOI GORDO CEPEA/ESALQ" — the São Paulo reference market.
  { produtoId: "1,2", serieId: "2", cropId: "boi-gordo", regionId: "SP" },
  // "INDICADOR DO MILHO ESALQ/BM&FBOVESPA" — Campinas (SP) reference.
  { produtoId: "25,26", serieId: "77", cropId: "milho", regionId: "SP" },
  // "INDICADOR DO CAFÉ ARÁBICA CEPEA/ESALQ"
  { produtoId: "11,12", serieId: "23", cropId: "cafe", regionId: "SP" },
  // "INDICADOR DO SUÍNO VIVO CEPEA/ESALQ - São Paulo"
  { produtoId: "29,30", serieId: "129-1", cropId: "suino", regionId: "SP" },
  // "PREÇOS DO FRANGO CONGELADO CEPEA/ESALQ - ESTADO SP" (preço de atacado).
  { produtoId: "17,18", serieId: "181", cropId: "frango", regionId: "SP" },
  // "Bezerro - Média Estado de São Paulo"
  { produtoId: "9,10,33,34", serieId: "3", cropId: "bezerro", regionId: "SP" },

  // — Paraná —
  // "INDICADOR DA SOJA CEPEA/ESALQ - PARANÁ"
  { produtoId: "27,28", serieId: "12", cropId: "soja", regionId: "PR" },
  // "PREÇO MÉDIO DO TRIGO CEPEA/ESALQ - PARANÁ"
  { produtoId: "31,32", serieId: "178", cropId: "trigo", regionId: "PR" },
  // "INDICADOR DO SUÍNO VIVO CEPEA/ESALQ - Paraná"
  { produtoId: "29,30", serieId: "129-6", cropId: "suino", regionId: "PR" },
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
