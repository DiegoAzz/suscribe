import { LRUCache } from 'lru-cache';
import { env } from '../config/env.js';

export interface CachedLicenseDecision {
  allowed: boolean;
  statusCode: number;
  reason?: string;
  tenantCode?: string;
  appSlug?: string;
  warningHeader?: string;
  headers?: Record<string, string>;
  cachedAt: number;
}

const cache = new LRUCache<string, CachedLicenseDecision>({
  max: 10000,
  ttl: env.CACHE_TTL_MS,
  allowStale: false,
});

export const licenseCache = {
  get(domain: string): CachedLicenseDecision | undefined {
    return cache.get(domain.toLowerCase());
  },

  set(domain: string, decision: CachedLicenseDecision): void {
    cache.set(domain.toLowerCase(), decision);
  },

  invalidate(domain: string): void {
    cache.delete(domain.toLowerCase());
  },

  clear(): void {
    cache.clear();
  },

  size(): number {
    return cache.size;
  },
};
