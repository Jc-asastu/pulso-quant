import { SeriesWindowSchema, type SeriesWindow } from "@pulso/shared";
import type { RedisLike } from "./redis.js";

/**
 * A hot cache for computed SeriesWindows, backed by Redis. This replaces the
 * old in-process Map: the ingestor is stateless again, and multiple instances
 * share one cache. TTL is delegated to Redis via PX.
 */
export interface SeriesCache {
  get(key: string): Promise<SeriesWindow | undefined>;
  set(key: string, value: SeriesWindow, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

const NS = "series:";

export function createSeriesCache(redis: RedisLike, defaultTtlMs: number): SeriesCache {
  return {
    async get(key) {
      const raw = await redis.get(NS + key);
      if (!raw) return undefined;
      try {
        // Validate on the way out: a stale or corrupt entry reads as a miss
        // rather than poisoning a response.
        const parsed = SeriesWindowSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    },

    async set(key, value, ttlMs) {
      await redis.set(NS + key, JSON.stringify(value), "PX", ttlMs ?? defaultTtlMs);
    },

    async del(key) {
      await redis.del(NS + key);
    },

    async clear() {
      await redis.flushdb();
    },
  };
}
