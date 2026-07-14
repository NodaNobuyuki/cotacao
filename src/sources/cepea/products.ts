/**
 * Catalog of CEPEA product ids as used by the consulta form.
 *
 * `id` is the literal `value` of the radio button on the consulta page and is
 * posted verbatim as `produto=<id>`. Treat it as opaque: most are comma-joined
 * numbers ("1,2" = boi gordo), one is a word ("dolar"). Scraped from the live
 * page on 2026-07-13; every challenge solve rewrites data/cepea/products.json,
 * so drift against this list is visible.
 */
export interface CepeaProduct {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
}

export const KNOWN_PRODUCTS: readonly CepeaProduct[] = [
  { id: "1,2", slug: "boi-gordo", nome: "Boi gordo" },
  { id: "27,28", slug: "soja", nome: "Soja" },
  { id: "25,26", slug: "milho", nome: "Milho" },
  { id: "11,12", slug: "cafe", nome: "Café" },
  { id: "5,6", slug: "algodao", nome: "Algodão" },
  { id: "7,8", slug: "arroz", nome: "Arroz" },
  { id: "9,10,33,34", slug: "bezerro", nome: "Bezerro" },
  { id: "31,32", slug: "trigo", nome: "Trigo" },
  { id: "29,30", slug: "suino", nome: "Suíno" },
  { id: "17,18", slug: "frango", nome: "Frango" },
  { id: "21,72,73", slug: "leite", nome: "Leite" },
  { id: "84,85", slug: "feijao", nome: "Feijão" },
  { id: "23,24", slug: "mandioca", nome: "Mandioca" },
  { id: "82,83", slug: "tilapia", nome: "Tilápia" },
  {
    id: "3,4,35,36,37,38,43,44,45,46,47,48,49,50",
    slug: "acucar",
    nome: "Açúcar",
  },
  {
    id: "15,16,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68",
    slug: "etanol",
    nome: "Etanol",
  },
  { id: "dolar", slug: "dolar", nome: "Dólar" },
];

/** The subset the dashboard ships with today. */
export const DEFAULT_PRODUCT_SLUGS: readonly string[] = [
  "boi-gordo",
  "soja",
  "milho",
];

export function findProduct(idOrSlug: string): CepeaProduct | undefined {
  return KNOWN_PRODUCTS.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}
