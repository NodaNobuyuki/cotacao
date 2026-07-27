/**
 * A small in-process TTL cache, so repeated renders of the same location do
 * not re-hit Open-Meteo.
 *
 * Deliberately not a persisted cache: forecasts are refreshed upstream roughly
 * hourly, and the dashboard already revalidates on a timer. This exists to
 * collapse the burst of identical calls a single page render produces, not to
 * survive restarts.
 */

interface Entry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries = 200) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Insertion order is Map's iteration order, so the first key is the oldest.
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}
