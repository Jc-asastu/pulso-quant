import Redis from "ioredis";
import { config } from "./config.js";

/**
 * The slice of the Redis client the cache uses. `ioredis` and `ioredis-mock`
 * both implement it, so the cache is unit-testable without a live Redis.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "PX", ttl: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  flushdb(): Promise<unknown>;
}

let client: Redis | undefined;

/** Lazily connects a single shared client. Only called at runtime, never in tests. */
export function getRedis(): Redis {
  if (!client) {
    if (!config.redisUrl) {
      throw new Error("REDIS_URL is not set — the ingestor needs a Redis connection string");
    }
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
  }
  return client;
}
