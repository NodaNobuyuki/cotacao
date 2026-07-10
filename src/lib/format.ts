const LOCALE = "pt-BR";

/**
 * Dates are stored as bare "YYYY-MM-DD" with no time or zone. Formatting them
 * through the host timezone would shift the day backwards anywhere west of
 * Greenwich — including all of Brazil. Always format in UTC.
 */
function asUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function formatPrice(value: number, decimals = 2): string {
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Signed percentage, or an em dash when the history is too short to know. */
export function formatPct(value: number | undefined, decimals = 2): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** "08/07" */
export function formatShortDate(iso: string): string {
  return asUtcDate(iso).toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/** "08 de jul. de 2026" */
export function formatLongDate(iso: string): string {
  return asUtcDate(iso).toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function trendDirection(value: number | undefined): "up" | "down" | "flat" {
  if (value === undefined || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

export function trendArrow(value: number | undefined): string {
  const d = trendDirection(value);
  return d === "up" ? "▲" : d === "down" ? "▼" : "•";
}

/** Whole calendar days between an ISO day and today, in UTC. */
export function daysSince(iso: string): number {
  const then = asUtcDate(iso).getTime();
  const today = asUtcDate(new Date().toISOString().slice(0, 10)).getTime();
  return Math.round((today - then) / 86_400_000);
}
