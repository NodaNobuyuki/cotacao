/**
 * Cloudflare session management for CEPEA.
 *
 * Playwright is used for exactly one thing: loading the consulta page in a
 * real browser so Cloudflare's challenge resolves and hands out
 * `cf_clearance` (+ `PHPSESSID`). The resulting cookies and the browser's
 * User-Agent are persisted to disk and reused by plain `fetch` calls until
 * they expire — no browser stays open between runs.
 *
 * Important: `cf_clearance` is bound to the User-Agent (and IP) that solved
 * the challenge, so the exact UA string is stored alongside the cookies and
 * must be sent on every subsequent request.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type Page } from "playwright";

export interface StoredCookie {
  readonly name: string;
  readonly value: string;
}

export interface CepeaSession {
  readonly cookies: readonly StoredCookie[];
  /** UA of the browser that solved the challenge; must accompany the cookies. */
  readonly userAgent: string;
  /** ISO timestamp of when the challenge was solved. */
  readonly obtainedAt: string;
}

/** A radio option scraped from the consulta form: maps product → form id. */
export interface CepeaProductOption {
  readonly id: string;
  readonly label: string;
}

export interface ChallengeResult {
  readonly session: CepeaSession;
  readonly products: readonly CepeaProductOption[];
}

export interface SolveChallengeOptions {
  /** The consulta page URL (also the page whose radios are scraped). */
  readonly url: string;
  /** Cloudflare frequently blocks headless browsers; default is headed. */
  readonly headless: boolean;
  readonly timeoutMs: number;
}

export class ChallengeUnsolvedError extends Error {
  constructor(timeoutMs: number) {
    super(
      `Cloudflare challenge not solved within ${timeoutMs}ms — ` +
        `no cf_clearance cookie appeared. Try CEPEA_HEADLESS=false.`,
    );
    this.name = "ChallengeUnsolvedError";
  }
}

/**
 * Opens the consulta page, waits until Cloudflare issues `cf_clearance`,
 * then captures cookies, the UA, and the product radio mapping.
 */
export async function solveCloudflareChallenge(
  options: SolveChallengeOptions,
): Promise<ChallengeResult> {
  const browser = await chromium.launch({
    headless: options.headless,
    // Without this, Cloudflare fingerprints the browser as automated and the
    // interstitial never clears — it just loops.
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    const page = await context.newPage();
    await page.goto(options.url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });

    // A cf_clearance cookie is NOT proof of success: Cloudflare sets one while
    // the challenge is still running (next to cf_chl_rc_ni), and requests made
    // with it come back as "Just a moment". The only trustworthy signal is the
    // real consulta form being on screen.
    const deadline = Date.now() + options.timeoutMs;
    while (!(await isConsultaPageLoaded(page))) {
      if (Date.now() > deadline) throw new ChallengeUnsolvedError(options.timeoutMs);
      await page.waitForTimeout(1_000);
    }

    const cookies = await context.cookies(options.url);
    const userAgent = await readUserAgent(page);
    const products = await scrapeProductOptions(page);

    return {
      session: {
        cookies: cookies.map(({ name, value }) => ({ name, value })),
        userAgent,
        obtainedAt: new Date().toISOString(),
      },
      products,
    };
  } finally {
    await browser.close();
  }
}

async function isConsultaPageLoaded(page: Page): Promise<boolean> {
  try {
    const title = await page.title();
    if (/just a moment/i.test(title)) return false;
    return (await page.$$('input[type="radio"]')).length > 0;
  } catch {
    // The challenge page reloads itself; a navigation mid-check is normal.
    return false;
  }
}

/** The challenge page can still be settling; retry rather than crash the run. */
async function readUserAgent(page: Page): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate<string>(() => navigator.userAgent);
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }
  throw new Error(
    `Não foi possível ler o User-Agent do browser: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Reads the product radio buttons into id → label pairs.
 *
 * Values are opaque: most are comma-joined numbers ("1,2" = boi gordo) but at
 * least one is a word ("dolar"), so nothing is filtered on shape. Two caveats
 * the page forces on us:
 *
 *  - the radios are not wrapped in <label> and share a container that holds
 *    every option's text, so `parentElement.textContent` returns the whole
 *    blob; the label comes from `label[for]` or the adjacent text node;
 *  - the page has a second radio group (periodicidade: Diário/Semanal/…), so
 *    we keep only the largest group by `name` — the products.
 */
async function scrapeProductOptions(
  page: Page,
): Promise<CepeaProductOption[]> {
  try {
    const radios = await page.$$eval('input[type="radio"]', (elements) =>
      (elements as HTMLInputElement[])
        .filter((r) => r.value.trim() !== "")
        .map((r) => {
          const forLabel = r.id
            ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)
                ?.textContent
            : null;
          const sibling =
            r.nextSibling?.nodeType === Node.TEXT_NODE
              ? r.nextSibling.textContent
              : r.nextElementSibling?.textContent;
          return {
            id: r.value,
            label: (forLabel ?? sibling ?? "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 80),
            group: r.name,
          };
        }),
    );

    const groups = new Map<string, CepeaProductOption[]>();
    for (const { id, label, group } of radios) {
      const bucket = groups.get(group) ?? [];
      bucket.push({ id, label });
      groups.set(group, bucket);
    }
    let largest: CepeaProductOption[] = [];
    for (const bucket of groups.values()) {
      if (bucket.length > largest.length) largest = bucket;
    }
    return largest;
  } catch {
    // The catalog is a convenience, not a hard requirement of the run.
    return [];
  }
}

export async function loadSession(
  filePath: string,
): Promise<CepeaSession | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isCepeaSession(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveSession(
  filePath: string,
  session: CepeaSession,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(session, null, 2), "utf8");
}

export function isSessionFresh(session: CepeaSession, ttlMs: number): boolean {
  const obtained = Date.parse(session.obtainedAt);
  if (Number.isNaN(obtained)) return false;
  return Date.now() - obtained < ttlMs;
}

function isCepeaSession(value: unknown): value is CepeaSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["userAgent"] === "string" &&
    typeof v["obtainedAt"] === "string" &&
    Array.isArray(v["cookies"]) &&
    v["cookies"].every(
      (c: unknown) =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as Record<string, unknown>)["name"] === "string" &&
        typeof (c as Record<string, unknown>)["value"] === "string",
    )
  );
}
