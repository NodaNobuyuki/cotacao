/**
 * Parser for the legacy-format .xls files CEPEA's consulta tool exports.
 *
 * Real layout (confirmed against downloaded files, 2026-07):
 *
 *   Boi | INDICADOR DO BOI GORDO CEPEA/ESALQ     ← produto | série
 *   Nota   por arroba, descontado o Prazo de …   ← unit lives in here
 *   Fonte  Cepea
 *   Data   Valor                                 ← header row
 *   01/07/2026   335,30                          ← one row per trading day
 *
 * Some series add a US$ column. The header row is located by its "Data" cell
 * rather than by a fixed offset, so changes to the preamble don't break
 * ingestion.
 */
import { read, utils } from "xlsx";

export interface ParsedXlsRow {
  /** "YYYY-MM-DD" */
  readonly data: string;
  readonly valor: number;
  readonly valorUsd?: number;
}

export interface ParsedXls {
  /** Series name from the title row (the part after "|" when present). */
  readonly titulo: string;
  /** e.g. "R$/arroba"; empty when the sheet does not state a unit. */
  readonly unidade: string;
  readonly rows: readonly ParsedXlsRow[];
}

type Cell = string | number | boolean | Date | null;

export function parseCepeaXls(file: Buffer): ParsedXls {
  const workbook = read(file, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName === undefined ? undefined : workbook.Sheets[sheetName];
  if (sheet === undefined) {
    throw new Error("Planilha vazia: o .xls não contém nenhuma aba.");
  }

  const grid = utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerIndex = grid.findIndex((row) => row.some(isDataHeaderCell));
  if (headerIndex === -1) {
    throw new Error('Formato inesperado: nenhuma linha de cabeçalho com "Data".');
  }
  const header = grid[headerIndex] ?? [];

  const dateCol = header.findIndex(isDataHeaderCell);
  // Value column headers seen in the wild: "Valor", "À vista R$", "Média".
  const brlCol = header.findIndex(
    (cell) =>
      typeof cell === "string" &&
      /(^valor$|^m[ée]dia$|r\$|pre[çc]o)/i.test(cell.trim()) &&
      !/us\$|d[óo]lar/i.test(cell),
  );
  const usdCol = header.findIndex(
    (cell) => typeof cell === "string" && /(us\$|d[óo]lar)/i.test(cell),
  );
  if (brlCol === -1) {
    throw new Error(
      `Formato inesperado: nenhuma coluna de valor no cabeçalho ${JSON.stringify(header)}.`,
    );
  }

  const preamble = grid.slice(0, headerIndex).flat();
  const rows: ParsedXlsRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const data = parseDateCell(row[dateCol] ?? null);
    const valor = parseBrazilianNumber(row[brlCol] ?? null);
    if (data === null || valor === null) continue;
    const valorUsd =
      usdCol === -1 ? null : parseBrazilianNumber(row[usdCol] ?? null);
    rows.push(valorUsd === null ? { data, valor } : { data, valor, valorUsd });
  }

  return {
    titulo: extractTitulo(preamble),
    unidade: extractUnidade([...preamble, ...header]),
    rows,
  };
}

/** "1.234,56" → 1234.56; numeric cells pass through. Null when not a number. */
export function parseBrazilianNumber(cell: Cell): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  const normalized = cell.trim().replace(/\./g, "").replace(",", ".");
  if (normalized === "" || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Accepts "DD/MM/YYYY" strings, Excel date serials, and Date cells. */
export function parseDateCell(cell: Cell): string | null {
  if (cell instanceof Date) return toIsoDay(cell);
  if (typeof cell === "number") {
    // Excel serial: days since 1899-12-30.
    const ms = Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000;
    return toIsoDay(new Date(ms));
  }
  if (typeof cell === "string") {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cell.trim());
    if (match === null) return null;
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

/**
 * Title row reads "Boi | INDICADOR DO BOI GORDO CEPEA/ESALQ": the left side is
 * the product group, the right side the series. The series is what we want.
 */
export function extractTitulo(preamble: readonly Cell[]): string {
  const first = preamble.find(
    (cell): cell is string => typeof cell === "string" && cell.trim() !== "",
  );
  if (first === undefined) return "";
  const pipe = first.lastIndexOf("|");
  const value = pipe === -1 ? first : first.slice(pipe + 1);
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Sheets state the unit either explicitly ("R$/@") or, more commonly, inside
 * the Nota row ("por arroba, descontado o Prazo…"). Only the leading phrase is
 * the unit — the rest of the note is methodology.
 */
export function extractUnidade(cells: readonly Cell[]): string {
  for (const cell of cells) {
    if (typeof cell !== "string") continue;
    const text = cell.trim();
    if (/^data$/i.test(text)) continue;

    // Trailing ")" matters: série names embed the unit as "(R$/kg)", and
    // capturing the paren yields the nonsense unit "R$/kg)".
    const explicit = /R\$\s*\/\s*[^\s,;)]+(\s+de\s+\d+\s*\w+)?/i.exec(text);
    if (explicit !== null) return explicit[0].replace(/\s+/g, " ").trim();

    const nota = /\bpor\s+(arroba|saca(\s+de\s+[\d.,]+\s*kg)?|kg|quilo|tonelada|litro|d[úu]zia|caixa|cabe[çc]a|@)/i.exec(
      text,
    );
    const unidade = nota?.[1];
    if (unidade !== undefined) {
      return `R$/${unidade.replace(/\s+/g, " ").trim()}`;
    }
  }
  return "";
}

function isDataHeaderCell(cell: Cell): boolean {
  return typeof cell === "string" && /^data$/i.test(cell.trim());
}

function toIsoDay(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
