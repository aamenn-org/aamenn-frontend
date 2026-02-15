/**
 * Thumbnail Cache Service
 *
 * Caches DECRYPTED thumbnails and images for offline access.
 * This integrates with the multi-layer cache system.
 *
 * Flow:
 * 1. Check L1 (memory) → instant return
 * 2. Check L2 (IndexedDB) → fast return
 * 3. Download + decrypt in WORKER + cache → non-blocking
 */

import Dexie from 'dexie';
import { fileService } from '../index';
import { getCryptoWorkerPool, PRIORITY } from '../../workers';
import { getDownloadLimiter } from '../../utils/download-limiter';
import { getPerformanceMonitor } from '../../utils/performance-monitor';

// Debug logging - disabled in production
const DEBUG = false; // Set to true to enable cache debug logs
const log = (...args: unknown[]) =>
  DEBUG && console.log('[ThumbnailCache]', ...args);

// Cache configuration
const CACHE_CONFIG = {
  // TTL: 7 days for thumbnails, 3 days for full images
  THUMBNAIL_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  IMAGE_TTL_MS: 3 * 24 * 60 * 60 * 1000,
  // Max disk usage: 500MB for thumbnails, 2GB for full images
  MAX_THUMBNAIL_DISK_BYTES: 500 * 1024 * 1024,
  MAX_IMAGE_DISK_BYTES: 2 * 1024 * 1024 * 1024,
  // Eviction batch size when over limit
  EVICTION_BATCH_SIZE: 50,
};

// ============================================================================
// IndexedDB Schema for Decrypted Content
// ============================================================================

interface DecryptedThumbnailEntry {
  fileId: string;
  blob: Blob;
  timestamp: number;
  blurhash?: string;
}

interface DecryptedImageEntry {
  fileId: string;
  blob: Blob;
  timestamp: number;
}

interface FileMetadataEntry {
  fileId: string;
  metadata: unknown;
  timestamp: number;
}

class DecryptedCacheDB extends Dexie {
  thumbnails!: Dexie.Table<DecryptedThumbnailEntry, string>;
  images!: Dexie.Table<DecryptedImageEntry, string>;
  metadata!: Dexie.Table<FileMetadataEntry, string>;

  constructor() {
    super('AamennDecryptedCache');

    this.version(1).stores({
      thumbnails: 'fileId, timestamp',
      images: 'fileId, timestamp',
      metadata: 'fileId, timestamp',
    });
  }
}

// ============================================================================
// In-Memory LRU Cache
// ============================================================================

class SimpleLRUCache<T> {
  private cache = new Map<string, T>();
  private maxSize: number;
  private onEvict?: (key: string, value: T) => void;

  constructor(maxSize: number, onEvict?: (key: string, value: T) => void) {
    this.maxSize = maxSize;
    this.onEvict = onEvict;
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      const oldValue = this.cache.get(key);
      this.cache.delete(key);
      // Revoke old value if replacing
      if (oldValue && this.onEvict) {
        this.onEvict(key, oldValue);
      }
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        const evictedValue = this.cache.get(firstKey);
        this.cache.delete(firstKey);
        // Revoke evicted blob URL
        if (evictedValue && this.onEvict) {
          this.onEvict(firstKey, evictedValue);
        }
      }
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    const value = this.cache.get(key);
    this.cache.delete(key);
    // Revoke blob URL on explicit delete
    if (value && this.onEvict) {
      this.onEvict(key, value);
    }
  }

  clear(): void {
    // Revoke all blob URLs before clearing
    if (this.onEvict) {
      for (const [key, value] of this.cache.entries()) {
        this.onEvict(key, value);
      }
    }
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Bloom Filter for Fast Cache Existence Checks
// ============================================================================

/**
 * Simple Bloom Filter implementation.
 * Used to quickly answer "definitely NOT cached" without hitting IndexedDB.
 * False positives are okay (we'll check IDB), false negatives are not.
 *
 * ~10KB memory for 100K entries at 1% false positive rate.
 */
class BloomFilter {
  private bits: Uint8Array;
  private numHashes: number;
  private size: number;

  /**
   * @param expectedItems - Expected number of items (e.g., 100000 for 100K thumbnails)
   * @param falsePositiveRate - Acceptable false positive rate (e.g., 0.01 for 1%)
   */
  constructor(
    expectedItems: number = 100000,
    falsePositiveRate: number = 0.01
  ) {
    // Calculate optimal size: m = -n * ln(p) / (ln(2)^2)
    this.size = Math.ceil(
      (-expectedItems * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2)
    );
    // Calculate optimal number of hash functions: k = (m/n) * ln(2)
    this.numHashes = Math.ceil((this.size / expectedItems) * Math.LN2);
    // Allocate bit array (using Uint8Array, so divide by 8)
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
  }

  /**
   * Generate hash positions for a key using double hashing technique.
   * Uses FNV-1a as base hash (fast and good distribution).
   */
  private getHashPositions(key: string): number[] {
    // FNV-1a hash
    let h1 = 2166136261;
    let h2 = 2166136261;
    for (let i = 0; i < key.length; i++) {
      const c = key.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 16777619);
      h2 ^= c;
      h2 = Math.imul(h2, 2654435761);
    }
    h1 = h1 >>> 0;
    h2 = h2 >>> 0;

    // Double hashing: position[i] = (h1 + i * h2) % size
    const positions: number[] = [];
    for (let i = 0; i < this.numHashes; i++) {
      positions.push(((h1 + i * h2) >>> 0) % this.size);
    }
    return positions;
  }

  /**
   * Add a key to the bloom filter.
   */
  add(key: string): void {
    for (const pos of this.getHashPositions(key)) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      this.bits[byteIndex] |= 1 << bitIndex;
    }
  }

  /**
   * Check if a key MIGHT be in the set.
   * Returns false = definitely NOT in set (100% certain)
   * Returns true = MAYBE in set (need to verify with actual lookup)
   */
  mightContain(key: string): boolean {
    for (const pos of this.getHashPositions(key)) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false; // Definitely not in set
      }
    }
    return true; // Maybe in set
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.bits.fill(0);
  }

  /**
   * Get memory usage in bytes.
   */
  get memoryUsage(): number {
    return this.bits.byteLength;
  }
}

// ============================================================================
// Thumbnail Cache Service
// ============================================================================

class ThumbnailCacheService {
  private db: DecryptedCacheDB;
  private memoryCache: SimpleLRUCache<string>; // Stores blob URLs for thumbnails
  private imageMemoryCache: SimpleLRUCache<string>; // L1 for full/medium images
  private pendingRequests = new Map<string, Promise<string>>();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  // Bloom filters for fast "definitely not cached" checks
  private thumbnailBloomFilter: BloomFilter;
  private imageBloomFilter: BloomFilter;

  constructor() {
    this.db = new DecryptedCacheDB();
    
    // Memory cache with blob URL revocation on eviction
    this.memoryCache = new SimpleLRUCache<string>(2000, (key, blobUrl) => {
      try {
        URL.revokeObjectURL(blobUrl);
        log(`Revoked blob URL for thumbnail: ${key}`);
      } catch (err) {
        // Ignore errors from already-revoked URLs
      }
    });
    
    // Image memory cache with blob URL revocation on eviction
    this.imageMemoryCache = new SimpleLRUCache<string>(100, (key, blobUrl) => {
      try {
        URL.revokeObjectURL(blobUrl);
        log(`Revoked blob URL for image: ${key}`);
      } catch (err) {
        // Ignore errors from already-revoked URLs
      }
    });
    
    // Bloom filters: 100K capacity, 1% false positive rate (~10KB each)
    this.thumbnailBloomFilter = new BloomFilter(100000, 0.01);
    this.imageBloomFilter = new BloomFilter(10000, 0.01); // Fewer full images
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.db.open().then(async () => {
      // Populate bloom filters from existing IDB cache (one-time scan)
      await this.populateBloomFilters();
      
      // Run cache maintenance on startup (non-blocking)
      this.evictExpired().catch((err) =>
        console.warn('[ThumbnailCache] Failed to evict expired entries:', err)
      );
      this.enforceSizeLimits().catch((err) =>
        console.warn('[ThumbnailCache] Failed to enforce size limits:', err)
      );
      
      this.isInitialized = true;
      log('Initialized');
    });

    return this.initPromise;
  }

  /**
   * Populate bloom filters from existing IndexedDB cache.
   * Called once on init - scans all keys and adds them to bloom filter.
   */
  private async populateBloomFilters(): Promise<void> {
    try {
      // Scan thumbnail keys
      const thumbnailKeys = await this.db.thumbnails
        .toCollection()
        .primaryKeys();
      for (const key of thumbnailKeys) {
        this.thumbnailBloomFilter.add(key as string);
      }
      log(
        `Bloom filter populated with ${
          thumbnailKeys.length
        } thumbnail keys (~${Math.round(
          this.thumbnailBloomFilter.memoryUsage / 1024
        )}KB)`
      );

      // Scan image keys
      const imageKeys = await this.db.images.toCollection().primaryKeys();
      for (const key of imageKeys) {
        this.imageBloomFilter.add(key as string);
      }
      log(`Bloom filter populated with ${imageKeys.length} image keys`);
    } catch (error) {
      // Non-fatal: bloom filters just won't be pre-populated
      console.warn('[ThumbnailCache] Failed to populate bloom filters:', error);
    }
  }

  /**
   * Get a thumbnail, using cache if available.
   * Returns a blob URL that can be used in <img src>.
   */
  async getThumbnail(
    fileId: string,
    thumbnailUrl: string,
    cipherThumbKey: string,
    masterKey: CryptoKey,
    blurhash?: string
  ): Promise<string> {
    await this.init();
    
    const perfMonitor = getPerformanceMonitor();
    perfMonitor.markStart(`thumbnail_${fileId}`);

    // L1: Check memory cache
    const memCached = this.memoryCache.get(fileId);
    if (memCached) {
      log(`L1 HIT: ${fileId}`);
      perfMonitor.recordCacheHit('L1', 'thumbnail');
      perfMonitor.markEnd(`thumbnail_${fileId}`, { cache: 'L1' });
      return memCached;
    }

    // Check if already fetching
    const pending = this.pendingRequests.get(fileId);
    if (pending) {
      return pending;
    }

    // L2: Check IndexedDB (bloom filter first to avoid unnecessary IDB reads)
    if (this.thumbnailBloomFilter.mightContain(fileId)) {
      const dbCached = await this.db.thumbnails.get(fileId);
      if (dbCached) {
        const url = URL.createObjectURL(dbCached.blob);
        this.memoryCache.set(fileId, url);
        log(`L2 HIT: ${fileId}`);
        perfMonitor.recordCacheHit('L2', 'thumbnail');
        perfMonitor.markEnd(`thumbnail_${fileId}`, { cache: 'L2' });
        return url;
      }
      // False positive from bloom filter - continue to L3
      log(`L2 BLOOM FALSE POSITIVE: ${fileId}`);
    } else {
      log(`L2 BLOOM SKIP: ${fileId} (definitely not cached)`);
    }

    // L3: Download, decrypt, and cache
    perfMonitor.recordCacheMiss('thumbnail');
    const fetchPromise = this.fetchAndCache(
      fileId,
      thumbnailUrl,
      cipherThumbKey,
      masterKey,
      blurhash
    );

    this.pendingRequests.set(fileId, fetchPromise);

    try {
      const result = await fetchPromise;
      perfMonitor.markEnd(`thumbnail_${fileId}`, { cache: 'L3' });
      return result;
    } finally {
      this.pendingRequests.delete(fileId);
    }
  }

  /**
   * Get a thumbnail with priority and cancellation support.
   * Use this for visible thumbnails that need to load first.
   *
   * @param fileId - Unique file identifier
   * @param thumbnailUrl - URL to encrypted thumbnail
   * @param cipherThumbKey - Encrypted key for thumbnail
   * @param masterKey - User's master key (CryptoKey)
   * @param options - Options for priority, cancellation, and pre-exported key bytes
   * @returns Promise resolving to blob URL
   */
  async getThumbnailWithPriority(
    fileId: string,
    thumbnailUrl: string,
    cipherThumbKey: string,
    masterKey: CryptoKey,
    options: {
      priority?: 'high' | 'normal' | 'low';
      signal?: AbortSignal;
      blurhash?: string;
      masterKeyBytes?: ArrayBuffer; // Pre-exported key bytes to avoid repeated exportKey
    } = {}
  ): Promise<string> {
    await this.init();

    const { priority = 'normal', signal, blurhash, masterKeyBytes } = options;

    // Check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Thumbnail load cancelled', 'AbortError');
    }

    // L1: Check memory cache (instant)
    const memCached = this.memoryCache.get(fileId);
    if (memCached) {
      log(`L1 HIT: ${fileId}`);
      return memCached;
    }

    // Check if already fetching - share the promise but respect new abort signal
    const pending = this.pendingRequests.get(fileId);
    if (pending) {
      // If caller has abort signal, race with the pending request
      if (signal) {
        return Promise.race([
          pending,
          new Promise<string>((_, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(
                  new DOMException('Thumbnail load cancelled', 'AbortError')
                );
              },
              { once: true }
            );
          }),
        ]);
      }
      return pending;
    }

    // L2: Check IndexedDB (bloom filter first to avoid unnecessary IDB reads)
    if (this.thumbnailBloomFilter.mightContain(fileId)) {
      const dbCached = await this.db.thumbnails.get(fileId);
      if (dbCached) {
        const url = URL.createObjectURL(dbCached.blob);
        this.memoryCache.set(fileId, url);
        log(`L2 HIT: ${fileId}`);
        return url;
      }
      // False positive from bloom filter - continue to L3
    }

    // L3: Download, decrypt, and cache with priority
    const fetchPromise = this.fetchAndCacheWithPriority(
      fileId,
      thumbnailUrl,
      cipherThumbKey,
      masterKey,
      { priority, signal, blurhash, masterKeyBytes }
    );

    this.pendingRequests.set(fileId, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingRequests.delete(fileId);
    }
  }

  /**
   * Check if thumbnail is cached (without fetching).
   * Uses bloom filter for fast "definitely not cached" response.
   */
  async hasCachedThumbnail(fileId: string): Promise<boolean> {
    await this.init();

    // L1: Memory cache
    if (this.memoryCache.has(fileId)) return true;

    // Bloom filter: fast "definitely not cached" check
    if (!this.thumbnailBloomFilter.mightContain(fileId)) {
      return false; // Definitely not cached
    }

    // Bloom filter said "maybe" - verify with IDB
    const count = await this.db.thumbnails
      .where('fileId')
      .equals(fileId)
      .count();
    return count > 0;
  }

  /**
   * Get cached thumbnail URL if available (returns null if not cached).
   */
  async getCachedThumbnailUrl(fileId: string): Promise<string | null> {
    await this.init();

    // L1: Check memory
    const memCached = this.memoryCache.get(fileId);
    if (memCached) return memCached;

    // Bloom filter check first
    if (!this.thumbnailBloomFilter.mightContain(fileId)) {
      return null; // Definitely not cached
    }

    // L2: Check IndexedDB
    const dbCached = await this.db.thumbnails.get(fileId);
    if (dbCached) {
      const url = URL.createObjectURL(dbCached.blob);
      this.memoryCache.set(fileId, url);
      return url;
    }

    return null;
  }

  private async fetchAndCache(
    fileId: string,
    thumbnailUrl: string,
    cipherThumbKey: string,
    masterKey: CryptoKey,
    blurhash?: string
  ): Promise<string> {
    try {
      log(`L3 FETCH: ${fileId}`);

      // Download encrypted thumbnail with concurrency limiting
      const downloadLimiter = getDownloadLimiter();
      const encryptedData = await downloadLimiter.schedule(
        () => fileService.downloadFileContent(thumbnailUrl),
        1 // Normal priority
      );
      log(`Downloaded encrypted data: ${encryptedData.byteLength} bytes`);

      // Decrypt in Web Worker (non-blocking!)
      const workerPool = getCryptoWorkerPool();
      const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
      const decryptedData = await workerPool.decryptFile(
        encryptedData,
        cipherThumbKey,
        masterKeyBytes
      );

      // Debug: Check the first bytes of decrypted data (JPEG should start with FF D8 FF)
      const decryptedArray = new Uint8Array(decryptedData);
      if (DEBUG) {
        const header = Array.from(decryptedArray.slice(0, 10))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        log(`Decrypted ${decryptedData.byteLength} bytes, header: ${header}`);
      }

      // Verify JPEG signature
      if (decryptedArray[0] !== 0xff || decryptedArray[1] !== 0xd8) {
        console.warn('[ThumbnailCache] Decrypted data may not be JPEG format');
      }

      // Create blob
      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      log(`Created blob URL, size: ${blob.size}`);

      // Store in L1 (memory)
      this.memoryCache.set(fileId, url);

      // Add to bloom filter (for fast future lookups)
      this.thumbnailBloomFilter.add(fileId);

      // Store in L2 (IndexedDB) - fire and forget
      this.db.thumbnails
        .put({
          fileId,
          blob,
          timestamp: Date.now(),
          blurhash,
        })
        .catch(() => {
          // Silent fail for persistence - data is still in memory
        });

      return url;
    } catch (error) {
      console.error(`[ThumbnailCache] Failed to fetch ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch and cache thumbnail with priority and cancellation support.
   */
  private async fetchAndCacheWithPriority(
    fileId: string,
    thumbnailUrl: string,
    cipherThumbKey: string,
    masterKey: CryptoKey,
    options: {
      priority?: 'high' | 'normal' | 'low';
      signal?: AbortSignal;
      blurhash?: string;
      masterKeyBytes?: ArrayBuffer; // Pre-exported to avoid repeated exportKey calls
    } = {}
  ): Promise<string> {
    const { priority = 'normal', signal, blurhash, masterKeyBytes } = options;

    // Map string priority to worker pool priority and download priority
    const workerPriorityMap = {
      high: PRIORITY.HIGH,
      normal: PRIORITY.NORMAL,
      low: PRIORITY.LOW,
    };
    
    const downloadPriorityMap = {
      high: 2,
      normal: 1,
      low: 0,
    };

    try {
      log(`L3 FETCH (${priority}): ${fileId}`);

      // Check abort before download
      if (signal?.aborted) {
        throw new DOMException('Thumbnail load cancelled', 'AbortError');
      }

      // Download encrypted thumbnail with concurrency limiting and priority
      const downloadLimiter = getDownloadLimiter();
      const encryptedData = await downloadLimiter.schedule(
        () => fileService.downloadFileContent(thumbnailUrl),
        downloadPriorityMap[priority]
      );

      // Check abort after download
      if (signal?.aborted) {
        throw new DOMException('Thumbnail load cancelled', 'AbortError');
      }

      log(`Downloaded encrypted data: ${encryptedData.byteLength} bytes`);

      // Decrypt in Web Worker with priority and abort signal
      const workerPool = getCryptoWorkerPool();
      // Use pre-exported bytes if available, otherwise export (fallback)
      const keyBytes =
        masterKeyBytes ?? (await crypto.subtle.exportKey('raw', masterKey));
      const decryptedData = await workerPool.decryptFile(
        encryptedData,
        cipherThumbKey,
        keyBytes,
        {
          priority: workerPriorityMap[priority],
          signal,
        }
      );

      // Create blob
      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      log(`Created blob URL, size: ${blob.size}`);

      // Store in L1 (memory)
      this.memoryCache.set(fileId, url);

      // Add to bloom filter (for fast future lookups)
      this.thumbnailBloomFilter.add(fileId);

      // Store in L2 (IndexedDB) - fire and forget
      this.db.thumbnails
        .put({
          fileId,
          blob,
          timestamp: Date.now(),
          blurhash,
        })
        .catch(() => {
          // Silent fail for persistence
        });

      return url;
    } catch (error) {
      // Don't log abort errors as they're expected
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      console.error(`[ThumbnailCache] Failed to fetch ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Preload thumbnails in background.
   */
  preload(
    files: Array<{
      fileId: string;
      thumbnailUrl: string;
      cipherThumbKey: string;
      blurhash?: string;
    }>,
    masterKey: CryptoKey
  ): void {
    for (const file of files) {
      // Fire and forget
      this.getThumbnail(
        file.fileId,
        file.thumbnailUrl,
        file.cipherThumbKey,
        masterKey,
        file.blurhash
      ).catch(() => {}); // Ignore preload failures
    }
  }

  /**
   * Remove specific items from cache.
   */
  async remove(fileIds: string[]): Promise<void> {
    await this.init();

    for (const fileId of fileIds) {
      this.memoryCache.delete(fileId);
      await this.db.thumbnails.delete(fileId);
    }
  }

  /**
   * Clear all caches (call on logout).
   */
  async clear(): Promise<void> {
    await this.init();

    this.memoryCache.clear();
    this.imageMemoryCache.clear();
    this.thumbnailBloomFilter.clear();
    this.imageBloomFilter.clear();
    await this.db.thumbnails.clear();
    await this.db.images.clear();
    await this.db.metadata.clear();

    log('Cleared all caches');
  }

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<{
    memoryCount: number;
    diskCount: number;
    diskSize: number;
  }> {
    await this.init();

    const thumbnails = await this.db.thumbnails.toArray();
    const diskSize = thumbnails.reduce((sum, t) => sum + t.blob.size, 0);

    return {
      memoryCount: this.memoryCache.size,
      diskCount: thumbnails.length,
      diskSize,
    };
  }

  /**
   * Evict expired entries based on TTL.
   * Call periodically or on init to clean up stale cache.
   */
  async evictExpired(): Promise<void> {
    await this.init();

    const now = Date.now();

    // Evict expired thumbnails
    const expiredThumbnails = await this.db.thumbnails
      .where('timestamp')
      .below(now - CACHE_CONFIG.THUMBNAIL_TTL_MS)
      .toArray();

    if (expiredThumbnails.length > 0) {
      const expiredIds = expiredThumbnails.map((t) => t.fileId);
      await this.db.thumbnails.bulkDelete(expiredIds);
      log(`Evicted ${expiredIds.length} expired thumbnails`);
    }

    // Evict expired images
    const expiredImages = await this.db.images
      .where('timestamp')
      .below(now - CACHE_CONFIG.IMAGE_TTL_MS)
      .toArray();

    if (expiredImages.length > 0) {
      const expiredIds = expiredImages.map((i) => i.fileId);
      await this.db.images.bulkDelete(expiredIds);
      log(`Evicted ${expiredIds.length} expired images`);
    }
  }

  /**
   * Enforce size limits by evicting oldest entries.
   * Call after adding new items to keep cache bounded.
   */
  async enforceSizeLimits(): Promise<void> {
    await this.init();

    // Check thumbnail cache size
    const thumbnails = await this.db.thumbnails.orderBy('timestamp').toArray();
    let thumbnailSize = thumbnails.reduce((sum, t) => sum + t.blob.size, 0);

    if (thumbnailSize > CACHE_CONFIG.MAX_THUMBNAIL_DISK_BYTES) {
      const toEvict: string[] = [];
      for (const thumb of thumbnails) {
        if (thumbnailSize <= CACHE_CONFIG.MAX_THUMBNAIL_DISK_BYTES * 0.9) break;
        toEvict.push(thumb.fileId);
        thumbnailSize -= thumb.blob.size;
        if (toEvict.length >= CACHE_CONFIG.EVICTION_BATCH_SIZE) break;
      }
      if (toEvict.length > 0) {
        await this.db.thumbnails.bulkDelete(toEvict);
        log(`Evicted ${toEvict.length} thumbnails to enforce size limit`);
      }
    }

    // Check image cache size
    const images = await this.db.images.orderBy('timestamp').toArray();
    let imageSize = images.reduce((sum, i) => sum + i.blob.size, 0);

    if (imageSize > CACHE_CONFIG.MAX_IMAGE_DISK_BYTES) {
      const toEvict: string[] = [];
      for (const img of images) {
        if (imageSize <= CACHE_CONFIG.MAX_IMAGE_DISK_BYTES * 0.9) break;
        toEvict.push(img.fileId);
        imageSize -= img.blob.size;
        if (toEvict.length >= CACHE_CONFIG.EVICTION_BATCH_SIZE) break;
      }
      if (toEvict.length > 0) {
        await this.db.images.bulkDelete(toEvict);
        log(`Evicted ${toEvict.length} images to enforce size limit`);
      }
    }
  }

  // ==========================================================================
  // File List Caching (for offline access)
  // ==========================================================================

  /**
   * Cache file list for offline access.
   */
  async cacheFileList(files: unknown[]): Promise<void> {
    await this.init();

    await this.db.metadata.put({
      fileId: '__file_list__',
      metadata: files,
      timestamp: Date.now(),
    });

    log(`Cached ${files.length} files metadata`);
  }

  /**
   * Get cached file list.
   */
  async getCachedFileList(): Promise<unknown[] | null> {
    await this.init();

    const entry = await this.db.metadata.get('__file_list__');
    if (entry) {
      log('Returning cached file list');
      return entry.metadata as unknown[];
    }
    return null;
  }

  /**
   * Cache favorites list for offline access.
   */
  async cacheFavoritesList(files: unknown[]): Promise<void> {
    await this.init();

    await this.db.metadata.put({
      fileId: '__favorites_list__',
      metadata: files,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached favorites list.
   */
  async getCachedFavoritesList(): Promise<unknown[] | null> {
    await this.init();

    const entry = await this.db.metadata.get('__favorites_list__');
    return entry ? (entry.metadata as unknown[]) : null;
  }

  // ==========================================================================
  // Full Image Caching (for offline viewer access)
  // ==========================================================================

  /**
   * Get full image, using cache if available.
   * Returns a blob URL for the decrypted full-size image.
   * Uses L1 memory cache for instant access.
   */
  async getFullImage(
    fileId: string,
    downloadUrl: string,
    cipherFileKey: string,
    masterKey: CryptoKey,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    await this.init();

    const cacheKey = `full_${fileId}`;

    // L1: Check memory cache FIRST (instant)
    const memCached = this.imageMemoryCache.get(cacheKey);
    if (memCached) {
      log(`Full image L1 HIT: ${fileId}`);
      return memCached;
    }

    // Check if already fetching (prevent duplicate requests)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // L2: Check IndexedDB for cached full image (bloom filter first)
    if (this.imageBloomFilter.mightContain(cacheKey)) {
      const dbCached = await this.db.images.get(cacheKey);
      if (dbCached) {
        const url = URL.createObjectURL(dbCached.blob);
        this.imageMemoryCache.set(cacheKey, url); // Promote to L1
        log(`Full image L2 HIT: ${fileId}`);
        return url;
      }
      // False positive from bloom filter - continue to L3
    }

    // L3: Download, decrypt, and cache
    const fetchPromise = (async () => {
      log(`Full image L3 FETCH: ${fileId}`);

      const encryptedData = await fileService.downloadFileContent(downloadUrl);

      // Decrypt in Web Worker (non-blocking!)
      const workerPool = getCryptoWorkerPool();
      const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
      const decryptedData = await workerPool.decryptFile(
        encryptedData,
        cipherFileKey,
        masterKeyBytes
      );

      const blob = new Blob([decryptedData], { type: mimeType });
      const url = URL.createObjectURL(blob);

      // Store in L1 memory
      this.imageMemoryCache.set(cacheKey, url);

      // Add to bloom filter (for fast future lookups)
      this.imageBloomFilter.add(cacheKey);

      // Store in L2 IndexedDB (fire and forget)
      this.db.images
        .put({
          fileId: cacheKey,
          blob,
          timestamp: Date.now(),
        })
        .catch((err) =>
          console.error('[ThumbnailCache] Failed to cache full image:', err)
        );

      return url;
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Get medium thumbnail for viewer, using cache if available.
   * Uses L1 memory cache for instant access.
   */
  async getMediumThumbnail(
    fileId: string,
    thumbMediumUrl: string,
    cipherThumbMediumKey: string,
    masterKey: CryptoKey
  ): Promise<string> {
    await this.init();

    const cacheKey = `medium_${fileId}`;

    // L1: Check memory cache FIRST (instant)
    const memCached = this.imageMemoryCache.get(cacheKey);
    if (memCached) {
      log(`Medium thumb L1 HIT: ${fileId}`);
      return memCached;
    }

    // Check if already fetching
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // L2: Check IndexedDB (bloom filter first)
    if (this.imageBloomFilter.mightContain(cacheKey)) {
      const dbCached = await this.db.images.get(cacheKey);
      if (dbCached) {
        const url = URL.createObjectURL(dbCached.blob);
        this.imageMemoryCache.set(cacheKey, url); // Promote to L1
        log(`Medium thumb L2 HIT: ${fileId}`);
        return url;
      }
      // False positive - continue to L3
    }

    // L3: Download, decrypt, cache
    const fetchPromise = (async () => {
      log(`Medium thumb L3 FETCH: ${fileId}`);

      const encryptedData = await fileService.downloadFileContent(
        thumbMediumUrl
      );

      // Decrypt in Web Worker (non-blocking!)
      const workerPool = getCryptoWorkerPool();
      const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
      const decryptedData = await workerPool.decryptFile(
        encryptedData,
        cipherThumbMediumKey,
        masterKeyBytes
      );

      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      // Store in L1
      this.imageMemoryCache.set(cacheKey, url);

      // Add to bloom filter
      this.imageBloomFilter.add(cacheKey);

      // Store in L2 (fire and forget)
      this.db.images
        .put({
          fileId: cacheKey,
          blob,
          timestamp: Date.now(),
        })
        .catch((err) =>
          console.error('[ThumbnailCache] Failed to cache medium thumb:', err)
        );

      return url;
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Get large thumbnail for viewer, using cache if available.
   * Uses L1 memory cache for instant access.
   */
  async getLargeThumbnail(
    fileId: string,
    thumbLargeUrl: string,
    cipherThumbLargeKey: string,
    masterKey: CryptoKey
  ): Promise<string> {
    await this.init();

    const cacheKey = `large_${fileId}`;

    // L1: Check memory cache FIRST (instant)
    const memCached = this.imageMemoryCache.get(cacheKey);
    if (memCached) {
      log(`Large thumb L1 HIT: ${fileId}`);
      return memCached;
    }

    // Check if already fetching
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // L2: Check IndexedDB (bloom filter first)
    if (this.imageBloomFilter.mightContain(cacheKey)) {
      const dbCached = await this.db.images.get(cacheKey);
      if (dbCached) {
        const url = URL.createObjectURL(dbCached.blob);
        this.imageMemoryCache.set(cacheKey, url); // Promote to L1
        log(`Large thumb L2 HIT: ${fileId}`);
        return url;
      }
      // False positive - continue to L3
    }

    // L3: Download, decrypt, cache
    const fetchPromise = (async () => {
      log(`Large thumb L3 FETCH: ${fileId}`);

      const encryptedData = await fileService.downloadFileContent(
        thumbLargeUrl
      );

      // Decrypt in Web Worker (non-blocking!)
      const workerPool = getCryptoWorkerPool();
      const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
      const decryptedData = await workerPool.decryptFile(
        encryptedData,
        cipherThumbLargeKey,
        masterKeyBytes
      );

      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      // Store in L1
      this.imageMemoryCache.set(cacheKey, url);

      // Add to bloom filter
      this.imageBloomFilter.add(cacheKey);

      // Store in L2 (fire and forget)
      this.db.images
        .put({
          fileId: cacheKey,
          blob,
          timestamp: Date.now(),
        })
        .catch((err) =>
          console.error('[ThumbnailCache] Failed to cache large thumb:', err)
        );

      return url;
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Check if full image is in L1 memory (instant check).
   */
  hasFullImageInMemory(fileId: string): boolean {
    return this.imageMemoryCache.has(`full_${fileId}`);
  }

  /**
   * Get full image URL if it's already in memory (returns null if not).
   * Use this for instant display without async.
   */
  getFullImageFromMemory(fileId: string): string | null {
    return this.imageMemoryCache.get(`full_${fileId}`) || null;
  }

  /**
   * Get medium thumbnail URL if it's already in memory.
   */
  getMediumFromMemory(fileId: string): string | null {
    return this.imageMemoryCache.get(`medium_${fileId}`) || null;
  }

  /**
   * Get large thumbnail URL if it's already in memory.
   */
  getLargeThumbnailFromMemory(fileId: string): string | null {
    return this.imageMemoryCache.get(`large_${fileId}`) || null;
  }

  /**
   * Get small thumbnail URL if it's already in memory.
   */
  getSmallThumbnailFromMemory(fileId: string): string | null {
    return this.memoryCache.get(fileId) || null;
  }

  /**
   * Preload images for adjacent files (call this when viewing an image).
   * Enhanced with batched processing to avoid request spikes.
   */
  async preloadAdjacent(
    files: Array<{
      fileId: string;
      downloadUrl?: string;
      cipherFileKey?: string;
      thumbMediumUrl?: string;
      cipherThumbMediumKey?: string;
      mimeType?: string;
    }>,
    masterKey: CryptoKey
  ): Promise<void> {
    // Fire and forget - preload in background with controlled concurrency
    const concurrencyLimit = 3; // Process 3 at a time to avoid overwhelming

    for (let i = 0; i < files.length; i += concurrencyLimit) {
      const batch = files.slice(i, i + concurrencyLimit);

      await Promise.all(
        batch.map(async (file) => {
          const fileId = file.fileId;

          // Skip if already in L1 memory
          if (this.hasFullImageInMemory(fileId)) {
            return;
          }

          try {
            // Preload medium first (faster, good for quick swipes)
            if (file.thumbMediumUrl && file.cipherThumbMediumKey) {
              await this.getMediumThumbnail(
                fileId,
                file.thumbMediumUrl,
                file.cipherThumbMediumKey,
                masterKey
              );
            }

            // Then preload full image
            if (file.downloadUrl && file.cipherFileKey) {
              await this.getFullImage(
                fileId,
                file.downloadUrl,
                file.cipherFileKey,
                masterKey,
                file.mimeType || 'image/jpeg'
              );
            }
          } catch (err) {
            // Ignore individual preload errors
            console.debug(
              `[ThumbnailCache] Preload skipped for ${fileId}:`,
              err
            );
          }
        })
      );
    }
  }

  /**
   * Batch preload MEDIUM thumbnails for zone-based preloading.
   * Designed for predictive loading of 10+ images.
   */
  async batchPreload(
    filesMetadata: Array<{
      fileId: string;
      downloadUrl: string;
      cipherFileKey: string;
      thumbMediumUrl?: string;
      cipherThumbMediumKey?: string;
      mimeType?: string;
    }>,
    masterKey: CryptoKey,
    _options: { prioritizeMedium?: boolean } = {}
  ): Promise<void> {
    // Filter out files that already have medium thumbnail cached
    const toPreload = filesMetadata.filter(
      (f) => !this.getMediumFromMemory(f.fileId)
    );

    if (toPreload.length === 0) {
      log('All medium thumbnails already in cache');
      return;
    }

    log(`Batch preloading ${toPreload.length} medium thumbnails`);

    // Preload medium thumbnails
    const mediumPromises = toPreload
      .filter((f) => f.thumbMediumUrl && f.cipherThumbMediumKey)
      .map((f) =>
        this.getMediumThumbnail(
          f.fileId,
          f.thumbMediumUrl!,
          f.cipherThumbMediumKey!,
          masterKey
        ).catch(() => null)
      );

    await Promise.all(mediumPromises);
    log('Medium thumbnails preloaded');
  }

  /**
   * Batch preload FULL images for immediate adjacent images.
   */
  async batchPreloadFull(
    filesMetadata: Array<{
      fileId: string;
      downloadUrl: string;
      cipherFileKey: string;
      mimeType?: string;
    }>,
    masterKey: CryptoKey
  ): Promise<void> {
    // Filter out files that already have full image cached
    const toPreload = filesMetadata.filter(
      (f) => !this.getFullImageFromMemory(f.fileId)
    );

    if (toPreload.length === 0) {
      log('All full images already in cache');
      return;
    }

    log(`Batch preloading ${toPreload.length} full images`);

    const fullPromises = toPreload
      .filter((f) => f.downloadUrl && f.cipherFileKey)
      .map((f) =>
        this.getFullImage(
          f.fileId,
          f.downloadUrl,
          f.cipherFileKey,
          masterKey,
          f.mimeType || 'image/jpeg'
        ).catch(() => null)
      );

    await Promise.all(fullPromises);
    log('Full images preloaded');
  }

  /**
   * Check if full image is cached.
   */
  async hasFullImage(fileId: string): Promise<boolean> {
    await this.init();
    const count = await this.db.images
      .where('fileId')
      .equals(`full_${fileId}`)
      .count();
    return count > 0;
  }

  /**
   * Cache individual file metadata (for offline getFile()).
   */
  async cacheFileMetadata(fileId: string, metadata: unknown): Promise<void> {
    await this.init();

    await this.db.metadata.put({
      fileId: `file_${fileId}`,
      metadata,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached file metadata.
   */
  async getCachedFileMetadata(fileId: string): Promise<unknown | null> {
    await this.init();

    const entry = await this.db.metadata.get(`file_${fileId}`);
    return entry ? entry.metadata : null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const thumbnailCache = new ThumbnailCacheService();

// Initialize on import
thumbnailCache.init().catch(console.error);
