/**
 * Bounded LRU cache with per-entry TTL.
 *
 * The old implementation was an unbounded `Map` that only evicted on read, so
 * keys never queried again lived forever. This caps entries and evicts the
 * least-recently-used one on overflow.
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (this.now() >= entry.expiresAt) {
      this.store.delete(key);
      this.expirations++;
      this.misses++;
      return undefined;
    }
    // Re-insert to move this key to the most-recently-used end.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key: string, value: V, ttlMsOverride?: number): void {
    const ttl = ttlMsOverride ?? this.ttlMs;
    if (ttl <= 0) return; // caching disabled

    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + ttl });

    while (this.store.size > this.maxEntries) {
      // Map preserves insertion order, so the first key is the LRU one.
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
      this.evictions++;
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Drop every expired entry. Cheap enough to run on an interval. */
  prune(): number {
    const t = this.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (t >= entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    this.expirations += removed;
    return removed;
  }

  stats(): CacheStats {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
    };
  }
}
