import * as fs from 'fs';
import type { EmphasisCache, EmphasisCacheEntry } from './step2-types';

export function loadCache(cachePath: string): EmphasisCache {
  if (!fs.existsSync(cachePath)) {
    return {
      version: '1.0',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      entries: [],
    };
  }
  return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
}

export function saveCache(cachePath: string, cache: EmphasisCache): void {
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export function findEntry(
  cache: EmphasisCache,
  shortId: string,
  telopTexts: string[]
): EmphasisCacheEntry | null {
  for (const entry of cache.entries) {
    if (entry.shortId === shortId &&
        entry.telopTexts.length === telopTexts.length &&
        entry.telopTexts.every((t, i) => t === telopTexts[i])) {
      return entry;
    }
  }
  return null;
}

export function addEntry(
  cache: EmphasisCache,
  shortId: string,
  telopTexts: string[],
  emphasisData: Array<Array<{ start: number; end: number; label: string }>>
): void {
  // 既存エントリを上書き
  const idx = cache.entries.findIndex(e => e.shortId === shortId);
  const entry: EmphasisCacheEntry = { shortId, telopTexts, emphasisData };
  if (idx >= 0) {
    cache.entries[idx] = entry;
  } else {
    cache.entries.push(entry);
  }
}
