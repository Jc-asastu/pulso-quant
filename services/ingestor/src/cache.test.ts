import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtlCache } from "./cache.js";

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a value before it expires", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 42);
    expect(cache.get("a")).toBe(42);
  });

  it("returns undefined for a missing key", () => {
    const cache = new TtlCache<number>(1000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires a value exactly at the TTL boundary", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 42);
    vi.advanceTimersByTime(999);
    expect(cache.get("a")).toBe(42);
    vi.advanceTimersByTime(1);
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts expired entries from storage on read", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 42);
    vi.advanceTimersByTime(1001);
    expect(cache.has("a")).toBe(false);
    expect(cache.size()).toBe(0);
  });

  it("overwrites an existing key and resets its TTL", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1);
    vi.advanceTimersByTime(900);
    cache.set("a", 2);
    vi.advanceTimersByTime(900);
    // Original TTL would have expired by now (1800ms > 1000ms), but the
    // overwrite at t=900 should have reset it.
    expect(cache.get("a")).toBe(2);
  });

  it("clear() removes all entries", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("delete() removes a single entry", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });
});
