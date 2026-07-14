/**
 * CepeaHybridScraperSource — the PriceDataSource implementation that combines
 * a one-off Playwright challenge solve with plain-fetch data calls.
 *
 * Flow per fetch (mirrors the HAR-confirmed consulta tool):
 *   1. ensure a fresh Cloudflare session (Playwright only when needed);
 *   2. POST listar_especificacao.aspx → series available for the product;
 *   3. GET consulta…?tabela_id=… → JSON pointing at a generated .xls;
 *   4. download the .xls, archive the raw bytes, parse into PricePoint[].
 *
 * A CepeaChallengeError anywhere triggers exactly one session renewal and a
 * retry of the failed step. A failing series is logged and skipped so the
 * rest of the batch still lands.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CepeaChallengeError,
  createCepeaClient,
  type CepeaHttpClient,
} from "./http";
import { parseCepeaXls } from "./parser";
import {
  isSessionFresh,
  loadSession,
  saveSession,
  solveCloudflareChallenge,
} from "./session";
import { CEPEA_FONTE, type PriceDataSource, type PricePoint } from "./types";

export interface CepeaSourceConfig {
  readonly baseUrl?: string;
  /** Where the Cloudflare cookies live between runs. */
  readonly sessionFile?: string;
  /** Raw .xls archive dir; every download is kept for audit/reprocessing. */
  readonly rawDir?: string;
  /** Product-radio mapping scraped on each challenge solve is written here. */
  readonly productsFile?: string;
  /** How long cookies are trusted before Playwright runs again. */
  readonly sessionTtlMs?: number;
  readonly minDelayMs?: number;
  readonly jitterMs?: number;
  /** Cloudflare tends to block headless browsers; default false (headed). */
  readonly headless?: boolean;
  readonly challengeTimeoutMs?: number;
  /**
   * Forces one periodicity for every série. Leave unset (the default) to use
   * the finest one each série actually publishes — see `pickPeriodicidade`.
   */
  readonly periodicidade?: string;
  readonly logger?: (message: string) => void;
}

/** One series of a product, as returned by listar_especificacao.aspx. */
interface Especificacao {
  readonly id: string;
  readonly nome: string;
  /** Periodicities CEPEA offers for this série, e.g. "1,3,4". See PERIODICIDADE. */
  readonly periodicidade: string;
}

/** CEPEA's periodicity codes, taken from the radio group on the consulta page. */
export const PERIODICIDADE = {
  diaria: "1",
  semanal: "2",
  mensal: "3",
  anual: "4",
} as const;

/**
 * Not every série is published daily — leite is monthly, trigo weekly. Asking
 * for a periodicity a série does not offer returns an empty sheet, so take the
 * finest one it actually supports.
 */
export function pickPeriodicidade(supported: string): string {
  const offered = supported.split(",").map((c) => c.trim());
  for (const code of [
    PERIODICIDADE.diaria,
    PERIODICIDADE.semanal,
    PERIODICIDADE.mensal,
  ]) {
    if (offered.includes(code)) return code;
  }
  return offered[0] ?? PERIODICIDADE.diaria;
}

const DEFAULTS = {
  // The apex domain answers with a flat 403; only www serves the solvable
  // challenge (confirmed 2026-07: Cf-Mitigated: challenge on www only).
  baseUrl: "https://www.cepea.org.br",
  sessionFile: join("data", "cepea", "session.json"),
  rawDir: join("data", "cepea", "raw"),
  productsFile: join("data", "cepea", "products.json"),
  // The observed cf_clearance lifetime is ~30 min; renew a bit earlier.
  sessionTtlMs: 25 * 60 * 1_000,
  minDelayMs: 3_000,
  jitterMs: 2_000,
  headless: false,
  challengeTimeoutMs: 120_000,
} as const;

const CONSULTA_PATH = "/br/consultas-ao-banco-de-dados-do-site.aspx";
const ESPECIFICACAO_PATH = "/br/indicador/listar_especificacao.aspx";

export class CepeaHybridScraperSource implements PriceDataSource {
  private readonly config: Required<
    Omit<CepeaSourceConfig, "logger" | "periodicidade">
  > &
    Pick<CepeaSourceConfig, "periodicidade">;
  private readonly log: (message: string) => void;
  private client: CepeaHttpClient | null = null;

  constructor(config: CepeaSourceConfig = {}) {
    const { logger, ...rest } = config;
    this.config = { ...DEFAULTS, ...rest };
    this.log =
      logger ?? ((message: string): void => console.log(`[cepea] ${message}`));
  }

  async fetch(
    produtoId: string,
    dataInicio: string,
    dataFim: string,
  ): Promise<PricePoint[]> {
    const especificacoes = await this.listEspecificacoes(produtoId);
    this.log(
      `produto ${produtoId}: ${especificacoes.length} série(s) encontrada(s)`,
    );

    const points: PricePoint[] = [];
    for (const spec of especificacoes) {
      try {
        const specPoints = await this.fetchSerie(
          produtoId,
          spec,
          dataInicio,
          dataFim,
        );
        this.log(`série "${spec.nome}": ${specPoints.length} cotações`);
        points.push(...specPoints);
      } catch (error) {
        // One broken series must not sink the batch.
        this.log(
          `série "${spec.nome}" (tabela ${spec.id}) falhou: ${errorMessage(error)} — seguindo para a próxima`,
        );
      }
    }
    return points;
  }

  /**
   * The séries CEPEA publishes for a product, without downloading any data.
   * Used to discover what exists (and its tabela_id) before mapping it in
   * adapter.ts.
   */
  async listSeries(
    produtoId: string,
  ): Promise<readonly { id: string; nome: string; periodicidade: string }[]> {
    return this.listEspecificacoes(produtoId);
  }

  private async listEspecificacoes(
    produtoId: string,
  ): Promise<Especificacao[]> {
    const url = `${this.config.baseUrl}${ESPECIFICACAO_PATH}`;
    const response = await this.request((client) =>
      client.postForm(url, { produto: produtoId }),
    );
    return parseEspecificacoes(response);
  }

  private async fetchSerie(
    produtoId: string,
    spec: Especificacao,
    dataInicio: string,
    dataFim: string,
  ): Promise<PricePoint[]> {
    const query = new URLSearchParams({
      tabela_id: spec.id,
      data_inicial: isoToBrDate(dataInicio),
      // Honour what the série publishes rather than demanding daily from a
      // monthly indicator, which comes back as an empty sheet.
      periodicidade:
        this.config.periodicidade ?? pickPeriodicidade(spec.periodicidade),
      data_final: isoToBrDate(dataFim),
    });
    const consultaUrl = `${this.config.baseUrl}${CONSULTA_PATH}?${query.toString()}`;

    const consulta = await this.request((client) => client.getJson(consultaUrl));
    const arquivoUrl = parseArquivoUrl(consulta);

    const xls = await this.request((client) => client.getBinary(arquivoUrl));
    await this.archiveRawFile(spec.id, xls);

    const parsed = parseCepeaXls(xls);
    const produto = spec.nome || parsed.titulo;
    return parsed.rows
      .filter((row) => row.data >= dataInicio && row.data <= dataFim)
      .map(
        (row): PricePoint => ({
          produtoId,
          serieId: spec.id,
          produto,
          data: row.data,
          valor: row.valor,
          ...(row.valorUsd === undefined ? {} : { valorUsd: row.valorUsd }),
          unidade: parsed.unidade,
          praca: extractPraca(produto),
          fonte: CEPEA_FONTE,
        }),
      );
  }

  /** Raw bytes are archived before parsing so data can be reprocessed later. */
  private async archiveRawFile(tabelaId: string, xls: Buffer): Promise<void> {
    await mkdir(this.config.rawDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(this.config.rawDir, `${stamp}-tabela-${tabelaId}.xls`);
    await writeFile(path, xls);
    this.log(`arquivo bruto salvo em ${path}`);
  }

  /**
   * Runs one HTTP operation with a valid session; on a challenge rejection,
   * renews the session once (Playwright) and retries the same operation.
   */
  private async request<T>(
    operation: (client: CepeaHttpClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.ensureClient(false);
    try {
      return await operation(client);
    } catch (error) {
      if (!(error instanceof CepeaChallengeError)) throw error;
      this.log(`${error.message} — renovando sessão via Playwright`);
      const renewed = await this.ensureClient(true);
      return await operation(renewed);
    }
  }

  private async ensureClient(forceRenew: boolean): Promise<CepeaHttpClient> {
    if (!forceRenew && this.client !== null) return this.client;

    let session = forceRenew
      ? null
      : await loadSession(this.config.sessionFile);
    if (session !== null && !isSessionFresh(session, this.config.sessionTtlMs)) {
      this.log("sessão persistida expirou pelo TTL");
      session = null;
    }

    if (session === null) {
      this.log("resolvendo challenge Cloudflare com Playwright…");
      const result = await solveCloudflareChallenge({
        url: `${this.config.baseUrl}${CONSULTA_PATH}`,
        headless: this.config.headless,
        timeoutMs: this.config.challengeTimeoutMs,
      });
      session = result.session;
      await saveSession(this.config.sessionFile, session);
      await this.writeProductsFile(result.products);
      this.log(`sessão nova obtida (${session.cookies.length} cookies)`);
    }

    this.client = createCepeaClient(session, {
      minDelayMs: this.config.minDelayMs,
      jitterMs: this.config.jitterMs,
      referer: `${this.config.baseUrl}${CONSULTA_PATH}`,
    });
    return this.client;
  }

  private async writeProductsFile(
    products: readonly { id: string; label: string }[],
  ): Promise<void> {
    if (products.length === 0) return;
    await mkdir(join(this.config.productsFile, ".."), { recursive: true });
    await writeFile(
      this.config.productsFile,
      JSON.stringify(products, null, 2),
      "utf8",
    );
    this.log(
      `${products.length} produtos mapeados do form salvos em ${this.config.productsFile}`,
    );
  }
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (CEPEA's expected format). */
export function isoToBrDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    throw new Error(`Data inválida "${iso}" — esperado YYYY-MM-DD.`);
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Series names carry the praça as a trailing dash segment when there is one:
 * "INDICADOR DA SOJA CEPEA/ESALQ - PARANÁ" → "PARANÁ".
 *
 * CEPEA writes praças in caps, while trailing segments in mixed case are
 * methodology qualifiers, not places — "Boi Gordo - Média a Prazo Estado de
 * São Paulo" has no praça. Units and numbers are likewise not praças.
 */
export function extractPraca(nomeSerie: string): string {
  const segments = nomeSerie.split(" - ");
  if (segments.length < 2) return "";
  const last = (segments[segments.length - 1] ?? "").trim();
  if (last === "" || /r\$|us\$|\d/i.test(last)) return "";
  return last === last.toUpperCase() ? last : "";
}

function parseEspecificacoes(value: unknown): Especificacao[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Resposta inesperada de listar_especificacao: ${JSON.stringify(value).slice(0, 200)}`,
    );
  }
  return value.map((item: unknown): Especificacao => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Especificação inesperada: item não é objeto.");
    }
    const record = item as Record<string, unknown>;
    const id = record["id"];
    const nome = record["nome"];
    const periodicidade = record["periodicidade"];
    if (typeof id !== "string" && typeof id !== "number") {
      throw new Error("Especificação sem campo id.");
    }
    return {
      // Ids are not always numeric: "129-6" (suíno PR), "leitep-SP" (leite SP).
      id: String(id),
      nome: typeof nome === "string" ? nome : "",
      periodicidade:
        typeof periodicidade === "string"
          ? periodicidade
          : PERIODICIDADE.diaria,
    };
  });
}

function parseArquivoUrl(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const arquivo = record["arquivo"];
    if (typeof arquivo === "string" && arquivo.startsWith("http")) {
      return arquivo;
    }
    const mensagem = record["mensagem"];
    throw new Error(
      `Consulta não gerou arquivo: ${typeof mensagem === "string" ? mensagem : JSON.stringify(value).slice(0, 200)}`,
    );
  }
  throw new Error("Resposta inesperada da consulta (não é objeto JSON).");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
