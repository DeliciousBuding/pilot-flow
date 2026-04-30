export interface EventDedupeOptions {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
}

export class EventDedupe {
  private readonly seenIds = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: EventDedupeOptions = {}, private readonly now: () => number = Date.now) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 2048;
  }

  seen(id: string): boolean {
    this.cleanup();
    if (this.seenIds.has(id)) return true;
    this.seenIds.set(id, this.now());
    this.trim();
    return false;
  }

  private cleanup(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, timestamp] of this.seenIds) {
      if (timestamp <= cutoff) this.seenIds.delete(id);
    }
  }

  private trim(): void {
    while (this.seenIds.size > this.maxEntries) {
      const oldest = [...this.seenIds.entries()].sort((a, b) => a[1] - b[1])[0];
      if (!oldest) return;
      this.seenIds.delete(oldest[0]);
    }
  }
}
