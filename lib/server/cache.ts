import "server-only";

interface Entry<T> {
  value: T;
  expires: number;
}

/**
 * Tiny in-memory TTL + LRU cache for upstream responses. Per server instance;
 * good enough for an MVP and keeps upstream archives from being hit on every
 * interaction. In-flight requests are de-duplicated.
 */
export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 50,
  ) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: T, ttlMs = this.ttlMs): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  /** Return a cached value or compute, cache and return it. Failures are not cached. */
  async getOrCreate(key: string, create: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = create()
      .then((v) => {
        this.set(key, v);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  clear(): void {
    this.map.clear();
    this.inflight.clear();
  }
}
