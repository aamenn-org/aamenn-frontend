/**
 * Cache Module
 *
 * Unified caching system for decrypted media with multi-layer architecture:
 * - L1: In-Memory LRU Cache (fastest, volatile)
 * - L2: IndexedDB Cache (persistent, survives refresh)
 *
 * Main entry point: thumbnailCache singleton
 */

// Core cache service (main entry point)
export { thumbnailCache } from './thumbnail-cache';

// Types
export type { CacheConfig, CacheStats } from './types';
export { DEFAULT_CACHE_CONFIG } from './types';
