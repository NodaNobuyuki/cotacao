import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import {
  extractUnidade,
  parseBrazilianNumber,
  parseCepeaXls,
  parseDateCell,
} from "./parser";
import { extractPraca, isoToBrDate } from "./source";

/** Builds a legacy .xls buffer shaped like CEPEA's consulta export. */
function buildXls(rows: readonly (readonly (string | number | null)[])[]): Buffer {
  const sheet = utils.aoa_to_sheet(rows as (string | number | null)[][]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Plan 1");
  return write(workbook, { type: "buffer", bookType: "xls" }) as Buffer;
}

describe("parseCepeaXls", () => {
  it("parses the real CEPEA layout (title | série, Nota, Fonte, Data/Valor)", () => {
    // Mirrors a genuine download: data/cepea/raw/…-tabela-2.xls (boi gordo).
    const xls = buildXls([
      ["Boi | INDICADOR DO BOI GORDO CEPEA/ESALQ", null, null],
      ["Nota", "por arroba, descontado o Prazo de Pagamento pela taxa CDI/CETIP", null],
      ["Fonte", "Cepea", null],
      ["Data", "Valor", null],
      ["01/07/2026", "335,30", null],
      ["02/07/2026", "1.332,75", null],
      [null, null, null],
    ]);

    const parsed = parseCepeaXls(xls);

    expect(parsed.titulo).toBe("INDICADOR DO BOI GORDO CEPEA/ESALQ");
    expect(parsed.unidade).toBe("R$/arroba");
    expect(parsed.rows).toEqual([
      { data: "2026-07-01", valor: 335.3 },
      { data: "2026-07-02", valor: 1332.75 },
    ]);
  });

  it("picks up a US$ column when the série has one", () => {
    const xls = buildXls([
      ["Soja | INDICADOR DA SOJA CEPEA/ESALQ - PARANÁ"],
      ["Nota", "por saca de 60 kg"],
      ["Data", "Valor R$", "Valor US$"],
      ["03/07/2026", "130,25", "23,10"],
    ]);

    const parsed = parseCepeaXls(xls);

    expect(parsed.unidade).toBe("R$/saca de 60 kg");
    expect(parsed.rows).toEqual([
      { data: "2026-07-03", valor: 130.25, valorUsd: 23.1 },
    ]);
  });

  it('accepts "Média" as the value column, as the carcaça suína sheet uses', () => {
    const xls = buildXls([
      ["Suíno | PREÇOS DA CARCAÇA SUÍNA ESPECIAL (R$/kg)"],
      ["Data", "Média"],
      ["10/07/2026", "9,85"],
    ]);

    const parsed = parseCepeaXls(xls);

    // The unit is embedded in the title as "(R$/kg)" — the paren is not a unit.
    expect(parsed.unidade).toBe("R$/kg");
    expect(parsed.rows).toEqual([{ data: "2026-07-10", valor: 9.85 }]);
  });

  it("skips junk rows instead of emitting NaN prices", () => {
    const xls = buildXls([
      ["Boi | INDICADOR"],
      ["Data", "Valor"],
      ["01/07/2026", "335,30"],
      ["Total", "n/d"],
      [null, null],
    ]);

    expect(parseCepeaXls(xls).rows).toEqual([
      { data: "2026-07-01", valor: 335.3 },
    ]);
  });

  it("rejects a sheet with no Data header", () => {
    expect(() => parseCepeaXls(buildXls([["nada", "a ver"]]))).toThrow(/cabeçalho/);
  });
});

describe("extractUnidade", () => {
  it("reads the unit out of the Nota row", () => {
    expect(extractUnidade(["Nota", "por arroba, descontado o Prazo"])).toBe(
      "R$/arroba",
    );
  });

  it("prefers an explicit R$/… when the sheet states one", () => {
    expect(extractUnidade(["INDICADOR - R$/@"])).toBe("R$/@");
  });

  it("returns empty rather than guessing when no unit is stated", () => {
    expect(extractUnidade(["Fonte", "Cepea", "Data"])).toBe("");
  });
});

describe("parseBrazilianNumber", () => {
  it.each([
    ["310,50", 310.5],
    ["1.234,56", 1234.56],
    ["-2,5", -2.5],
    [42, 42],
  ])("parses %s → %s", (input, expected) => {
    expect(parseBrazilianNumber(input)).toBe(expected);
  });

  it("returns null for non-numeric cells", () => {
    expect(parseBrazilianNumber("n/d")).toBeNull();
    expect(parseBrazilianNumber(null)).toBeNull();
    expect(parseBrazilianNumber("")).toBeNull();
  });
});

describe("parseDateCell", () => {
  it("parses DD/MM/YYYY strings", () => {
    expect(parseDateCell("09/07/2026")).toBe("2026-07-09");
  });

  it("parses Excel date serials (days since 1899-12-30)", () => {
    expect(parseDateCell(46212)).toBe("2026-07-09");
  });

  it("returns null for anything else", () => {
    expect(parseDateCell("total")).toBeNull();
    expect(parseDateCell(null)).toBeNull();
  });
});

describe("isoToBrDate", () => {
  it("converts ISO to the DD/MM/YYYY format CEPEA expects", () => {
    expect(isoToBrDate("2026-01-31")).toBe("31/01/2026");
  });

  it("rejects malformed dates instead of sending garbage upstream", () => {
    expect(() => isoToBrDate("31/01/2026")).toThrow(/YYYY-MM-DD/);
  });
});

describe("extractPraca", () => {
  it("takes the trailing dash segment when CEPEA wrote it as a praça (caps)", () => {
    expect(extractPraca("INDICADOR DA SOJA CEPEA/ESALQ - PARANÁ")).toBe("PARANÁ");
    expect(extractPraca("INDICADOR DA SOJA CEPEA/ESALQ - PARANAGUÁ")).toBe(
      "PARANAGUÁ",
    );
  });

  it("treats mixed-case trailing segments as methodology, not a praça", () => {
    // Real série name: the trailing text describes the pricing method.
    expect(extractPraca("Boi Gordo - Média a Prazo Estado de São Paulo")).toBe("");
  });

  it("ignores trailing segments that are units or numbers", () => {
    expect(extractPraca("SOJA CEPEA/ESALQ - R$/saca de 60 kg")).toBe("");
    expect(extractPraca("INDICADOR DO BOI GORDO CEPEA/ESALQ")).toBe("");
  });
});
