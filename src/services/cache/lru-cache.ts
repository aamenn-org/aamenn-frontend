/**
 * L1: LRU Memory Cache
 *
 * A generic Least Recently Used (LRU) cache implementation for in-memory caching.
 * Features:
 * - O(1) get/put operations using Map
 * - Automatic eviction when capacity is exceeded
 * - Size tracking in bytes
 * - TTL support (optional)
 *
 * Based on Ente.io's ThumbnailInMemoryLruCache pattern.
 */

export interface LRUCacheOptions {
  /** Maximum number of items */
  maxItems: number;
  /** Maximum size in bytes (optional) */
  maxSize?: number;
  /** Default TTL in milliseconds (optional) */
  defaultTTL?: number;
  /** Callback when item is evicted */
  onEvict?: (key: string, value: Blob) => void;
}

interface CacheEntry {
  value: Blob;
  size: number;
  timestamp: number;
  expiresAt?: number;
}

export class LRUCache {
  private cache: Map<string, CacheEntry>;
  private readonly maxItems: number;
  private readonly maxSize?: number;
  private readonly defaultTTL?: number;
  private readonly onEvict?: (key: string, value: Blob) => void;

  private currentSize: number = 0;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: LRUCacheOptions) {
    this.cache = new Map();
    this.maxItems = options.maxItems;
    this.maxSize = options.maxSize;
    this.defaultTTL = options.defaultTTL;
    this.onEvict = options.onEvict;
  }

  /**
   * Get an item from the cache.
   * Moves the item to the end (most recently used) if found.
   */
  get(key: string): Blob | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Move to end (most recently used) - Map maintains insertion order
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Check if an item exists without updating LRU order.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Put an item in the cache.
   * Evicts least recently used items if capacity is exceeded.
   */
  put(key: string, value: Blob, ttl?: number): void {
    const size = value.size;
    const expiresAt = ttl
      ? Date.now() + ttl
      : this.defaultTTL
      ? Date.now() + this.defaultTTL
      : undefined;

    // If key exists, update it
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }

    // Evict items if necessary
    this.evictIfNeeded(size);

    // Add new entry
    const entry: CacheEntry = {
      value,
      size,
      timestamp: Date.now(),
      expiresAt,
    };

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  /**
   * Delete an item from the cache.
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.currentSize -= entry.size;

    if (this.onEvict) {
      this.onEvict(key, entry.value);
    }

    return true;
  }

  /**
   * Clear all items from the cache.
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value);
      }
    }
    this.cache.clear();
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get current cache statistics.
   */
  getStats(): {
    itemCount: number;
    totalSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      itemCount: this.cache.size,
      totalSize: this.currentSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get all keys in the cache (in LRU order, oldest first).
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get the number of items in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get the total size of cached data in bytes.
   */
  get totalSize(): number {
    return this.currentSize;
  }

  /**
   * Evict items until there's room for newItemSize.
   */
  private evictIfNeeded(newItemSize: number): void {
    // Evict by count
    while (this.cache.size >= this.maxItems) {
      this.evictOldest();
    }

    // Evict by size if maxSize is set
    if (this.maxSize) {
      while (
        this.currentSize + newItemSize > this.maxSize &&
        this.cache.size > 0
      ) {
        this.evictOldest();
      }
    }
  }

  /**
   * Evict the oldest (least recently used) item.
   */
  private evictOldest(): void {
    // Map.keys() returns in insertion order, first is oldest
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.delete(oldestKey);
    }
  }

  /**
   * Remove expired items (call periodically for cleanup).
   */
  pruneExpired(): number {
    let pruned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

// ============================================================================
// Pre-configured Cache Instances
// ============================================================================

/**
 * Create a thumbnail-optimized LRU cache.
 * Capacity: 1000 items (thumbnails are small, ~10-50KB each)
 */
export function createThumbnailCache(
  onEvict?: (key: string, value: Blob) => void
): LRUCache {
  return new LRUCache({
    maxItems: 1000,
    maxSize: 100 * 1024 * 1024, // 100MB max
    onEvict,
  });
}

/**
 * Create an image-optimized LRU cache.
 * Capacity: 100 items (full images are larger, ~1-5MB each)
 */
export function createImageCache(
  onEvict?: (key: string, value: Blob) => void
): LRUCache {
  return new LRUCache({
    maxItems: 100,
    maxSize: 500 * 1024 * 1024, // 500MB max
    defaultTTL: 30 * 60 * 1000, // 30 minutes TTL for full images
    onEvict,
  });
}
