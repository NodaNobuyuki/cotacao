/**
 * Plain-fetch HTTP client that rides on the cookies Playwright obtained.
 *
 * Every request is throttled (min delay + jitter) so a batch never bursts,
 * and every response is inspected for signs that Cloudflare stopped honouring
 * the cookies — in which case a CepeaChallengeError is thrown so the caller
 * can renew the session and retry, instead of failing the whole pipeline.
 */
import type { CepeaSession } from "./session";

export class CepeaChallengeError extends Error {
  constructor(detail: string) {
    super(`Sessão Cloudflare expirada ou rejeitada: ${detail}`);
    this.name = "CepeaChallengeError";
  }
}

export interface CepeaHttpClient {
  postForm(url: string, body: Readonly<Record<string, string>>): Promise<unknown>;
  getJson(url: string): Promise<unknown>;
  getBinary(url: string): Promise<Buffer>;
}

export interface CepeaClientOptions {
  /** Minimum quiet time between any two requests, in ms. */
  readonly minDelayMs: number;
  /** Random extra delay added on top of minDelayMs, in ms. */
  readonly jitterMs: number;
  /** Sent as Referer on AJAX calls; the consulta page URL. */
  readonly referer: string;
}

export function createCepeaClient(
  session: CepeaSession,
  options: CepeaClientOptions,
): CepeaHttpClient {
  const cookieHeader = session.cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const baseHeaders: Record<string, string> = {
    // Must be the UA of the browser that solved the challenge: cf_clearance
    // is invalid under any other User-Agent.
    "User-Agent": session.userAgent,
    Cookie: cookieHeader,
    Referer: options.referer,
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  };

  let lastRequestAt = 0;
  async function throttle(): Promise<void> {
    const wait =
      lastRequestAt +
      options.minDelayMs +
      Math.random() * options.jitterMs -
      Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  }

  async function request(url: string, init: RequestInit): Promise<Response> {
    await throttle();
    const response = await fetch(url, { ...init, redirect: "follow" });
    if (response.status === 403 || response.status === 503) {
      throw new CepeaChallengeError(`HTTP ${response.status} em ${url}`);
    }
    return response;
  }

  async function readJson(response: Response, url: string): Promise<unknown> {
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      if (looksLikeChallengeHtml(text)) {
        throw new CepeaChallengeError(`HTML de challenge em vez de JSON (${url})`);
      }
      throw new Error(
        `Resposta não-JSON de ${url} (status ${response.status}): ${text.slice(0, 200)}`,
      );
    }
  }

  return {
    async postForm(url, body) {
      const response = await request(url, {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
        body: new URLSearchParams(body).toString(),
      });
      return readJson(response, url);
    },

    async getJson(url) {
      const response = await request(url, {
        method: "GET",
        headers: {
          ...baseHeaders,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
      });
      return readJson(response, url);
    },

    async getBinary(url) {
      const response = await request(url, {
        method: "GET",
        headers: { ...baseHeaders, Accept: "*/*" },
      });
      if (!response.ok) {
        throw new Error(`Download falhou (${response.status}) em ${url}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      // A challenge page instead of a binary starts with HTML markup.
      if (looksLikeChallengeHtml(bytes.subarray(0, 2048).toString("utf8"))) {
        throw new CepeaChallengeError(`HTML de challenge no download (${url})`);
      }
      return bytes;
    },
  };
}

function looksLikeChallengeHtml(text: string): boolean {
  const head = text.slice(0, 2048).toLowerCase();
  return (
    head.includes("just a moment") ||
    head.includes("challenge-platform") ||
    head.includes("cf-chl") ||
    (head.includes("<html") && head.includes("cloudflare"))
  );
}
