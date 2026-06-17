import type { NormalizedFlight } from "./types.js";

interface Entry { data: NormalizedFlight[]; expiresAt: number; }
const store = new Map<string, Entry>();
const TTL = 15 * 60 * 1000; // 15 minutes

export function getCached(key: string): NormalizedFlight[] | null {
  const e = store.get(key);
  if (!e || Date.now() > e.expiresAt) { store.delete(key); return null; }
  return e.data;
}

export function setCached(key: string, data: NormalizedFlight[]): void {
  store.set(key, { data, expiresAt: Date.now() + TTL });
}