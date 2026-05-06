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
import { LRUCache } from 'lru-cache';
import { fileService } from '../index';
import { cryptoService } from '../crypto.service';
import { getDownloadLimiter } from '../../utils/download-limiter';

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
// Thumbnail Cache Service
// ============================================================================

class ThumbnailCacheService {
  private db: DecryptedCacheDB;
  private memoryCache: LRUCache<string, string>; // Stores blob URLs for thumbnails
  private imageMemoryCache: LRUCache<string, string>; // L1 for full/medium images
  private pendingRequests = new Map<string, Promise<string>>();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.db = new DecryptedCacheDB();
    
    // Memory cache with blob URL revocation on eviction
    // Increased capacity for better grid scrolling performance
    this.memoryCache = new LRUCache<string, string>({
      max: 3000,
      dispose: (value, key) => {
        try {
          URL.revokeObjectURL(value);
          log(`Revoked blob URL for thumbnail: ${key}`);
        } catch {
          // Ignore errors from already-revoked URLs
        }
      },
    });

    // Image memory cache with blob URL revocation on eviction
    // Increased to 200 for better viewer navigation (medium + large for ~100 images)
    this.imageMemoryCache = new LRUCache<string, string>({
      max: 200,
      dispose: (value, key) => {
        try {
          URL.revokeObjectURL(value);
          log(`Revoked blob URL for image: ${key}`);
        } catch {
          // Ignore errors from already-revoked URLs
        }
      },
    });
    
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.db.open().then(async () => {
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
   * Get a thumbnail, using cache if available.
   * Returns a blob URL that can be used in <img src>.
   */
  async getThumbnail(
    fileId: string,
    thumbnailUrl: string,
    masterKey: CryptoKey,
    cipherFileKey: string,
  ): Promise<string> {
    // Validate inputs
    if (!fileId || !thumbnailUrl || !masterKey || !cipherFileKey) {
      throw new Error(`Invalid inputs: fileId=${!!fileId}, thumbnailUrl=${!!thumbnailUrl}, masterKey=${!!masterKey}, cipherFileKey=${!!cipherFileKey} - all are required`);
    }

    await this.init();
    
    // L1: Check memory cache
    const memCached = this.memoryCache.get(fileId);
    if (memCached) {
      log(`L1 HIT: ${fileId}`);
      return memCached;
    }

    // Check if already fetching
    const pending = this.pendingRequests.get(fileId);
    if (pending) {
      return pending;
    }

    // L2: Check IndexedDB
    const dbCached = await this.db.thumbnails.get(fileId);
    if (dbCached) {
      const url = URL.createObjectURL(dbCached.blob);
      this.memoryCache.set(fileId, url);
      log(`L2 HIT: ${fileId}`);
      return url;
    }

    // L3: Download, decrypt, and cache
    const fetchPromise = this.fetchAndCache(
      fileId,
      thumbnailUrl,
      masterKey,
      cipherFileKey,
    );

    this.pendingRequests.set(fileId, fetchPromise);

    try {
      return await fetchPromise;
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
    masterKey: CryptoKey,
    cipherFileKey: string,
    options: {
      priority?: 'high' | 'normal' | 'low';
      signal?: AbortSignal;
      masterKeyBytes?: ArrayBuffer; // Pre-exported key bytes to avoid repeated exportKey
    } = {}
  ): Promise<string> {
    await this.init();

    const { signal } = options;

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

    // L2: Check IndexedDB
    const dbCached = await this.db.thumbnails.get(fileId);
    if (dbCached) {
      const url = URL.createObjectURL(dbCached.blob);
      this.memoryCache.set(fileId, url);
      log(`L2 HIT: ${fileId}`);
      return url;
    }

    // L3: Download, decrypt, and cache
    const fetchPromise = this.fetchAndCache(
      fileId,
      thumbnailUrl,
      masterKey,
      cipherFileKey,
      options
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
   */
  async hasCachedThumbnail(fileId: string): Promise<boolean> {
    await this.init();

    // L1: Memory cache
    if (this.memoryCache.has(fileId)) return true;

    // L2: Check IndexedDB
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
    masterKey: CryptoKey,
    cipherFileKey: string,
    options: {
      priority?: 'high' | 'normal' | 'low';
      signal?: AbortSignal;
    } = {}
  ): Promise<string> {
    const { priority = 'normal', signal } = options;

    const workerPriorityMap = {
      high: cryptoService.PRIORITY.HIGH,
      normal: cryptoService.PRIORITY.NORMAL,
      low: cryptoService.PRIORITY.LOW,
    };

    const downloadPriorityMap: Record<'high' | 'normal' | 'low', number> = {
      high: 2,
      normal: 1,
      low: 0,
    };

    try {
      log(`L3 FETCH (${priority}): ${fileId}`);

      if (signal?.aborted) {
        throw new DOMException('Thumbnail load cancelled', 'AbortError');
      }

      const downloadLimiter = getDownloadLimiter();
      const encryptedData = (await downloadLimiter.add(
        () => fileService.downloadFileContent(thumbnailUrl),
        { priority: downloadPriorityMap[priority] }
      ))!;

      if (signal?.aborted) {
        throw new DOMException('Thumbnail load cancelled', 'AbortError');
      }

      const decryptedData = await cryptoService.decryptFile(
        encryptedData,
        cipherFileKey,
        masterKey,
        {
          priority: workerPriorityMap[priority],
          signal,
        }
      );

      const decryptedArray = new Uint8Array(decryptedData);
      if (decryptedArray[0] !== 0xff || decryptedArray[1] !== 0xd8) {
        console.warn('[ThumbnailCache] Decrypted data may not be JPEG format');
      }

      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      this.memoryCache.set(fileId, url);
      this.db.thumbnails
        .put({
          fileId,
          blob,
          timestamp: Date.now(),
        })
        .catch(() => {
          // Silent fail for persistence - data is still in memory
        });

      return url;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      console.error(`[ThumbnailCache] Failed to fetch ${fileId}:`, error);
      throw error;
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

  // ==========================================================================
  // Full Image Caching (for offline viewer access)
  // ==========================================================================

  private async getCachedImage(
    fileId: string,
    url: string,
    masterKey: CryptoKey,
    cipherFileKey: string,
    options: { prefix: string; mimeType?: string }
  ): Promise<string> {
    await this.init();
    const { prefix, mimeType = 'image/jpeg' } = options;
    const cacheKey = `${prefix}_${fileId}`;

    // L1: Check memory cache (instant)
    const memCached = this.imageMemoryCache.get(cacheKey);
    if (memCached) {
      log(`${prefix} L1 HIT: ${fileId}`);
      return memCached;
    }

    // Check if already fetching
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) return pending;

    // L2: Check IndexedDB
    const dbCached = await this.db.images.get(cacheKey);
    if (dbCached) {
      const blobUrl = URL.createObjectURL(dbCached.blob);
      this.imageMemoryCache.set(cacheKey, blobUrl);
      log(`${prefix} L2 HIT: ${fileId}`);
      return blobUrl;
    }

    // L3: Download, decrypt, cache
    const fetchPromise = (async () => {
      log(`${prefix} L3 FETCH: ${fileId}`);
      const encryptedData = await fileService.downloadFileContent(url);
      const decryptedData = await cryptoService.decryptFile(
        encryptedData,
        cipherFileKey,
        masterKey
      );
      const blob = new Blob([decryptedData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      this.imageMemoryCache.set(cacheKey, blobUrl);
      this.db.images
        .put({ fileId: cacheKey, blob, timestamp: Date.now() })
        .catch((err) =>
          console.error(`[ThumbnailCache] Failed to cache ${prefix}:`, err)
        );
      return blobUrl;
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Get full image, using cache if available.
   * Returns a blob URL for the decrypted full-size image.
   */
  async getFullImage(
    fileId: string,
    downloadUrl: string,
    masterKey: CryptoKey,
    cipherFileKey: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    return this.getCachedImage(fileId, downloadUrl, masterKey, cipherFileKey, { prefix: 'full', mimeType });
  }

  /**
   * Get medium thumbnail for viewer, using cache if available.
   */
  async getMediumThumbnail(
    fileId: string,
    thumbMediumUrl: string,
    masterKey: CryptoKey,
    cipherFileKey: string
  ): Promise<string> {
    return this.getCachedImage(fileId, thumbMediumUrl, masterKey, cipherFileKey, { prefix: 'medium' });
  }

  /**
   * Get large thumbnail for viewer, using cache if available.
   */
  async getLargeThumbnail(
    fileId: string,
    thumbLargeUrl: string,
    masterKey: CryptoKey,
    cipherFileKey: string
  ): Promise<string> {
    return this.getCachedImage(fileId, thumbLargeUrl, masterKey, cipherFileKey, { prefix: 'large' });
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
      thumbMediumUrl?: string;
      mimeType?: string;
      cipherFileKey?: string;
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
            if (file.thumbMediumUrl && file.cipherFileKey) {
              await this.getMediumThumbnail(
                fileId,
                file.thumbMediumUrl,
                masterKey,
                file.cipherFileKey
              );
            }

            // Then preload full image
            if (file.downloadUrl && file.cipherFileKey) {
              await this.getFullImage(
                fileId,
                file.downloadUrl,
                masterKey,
                file.cipherFileKey,
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
      thumbMediumUrl: string;
      mimeType: string;
      cipherFileKey: string;
    }>,
    masterKey: CryptoKey
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
      .filter((f) => f.thumbMediumUrl && f.cipherFileKey)
      .map((f) =>
        this.getMediumThumbnail(
          f.fileId,
          f.thumbMediumUrl!,
          masterKey,
          f.cipherFileKey
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
      mimeType?: string;
      cipherFileKey: string;
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
          masterKey,
          f.cipherFileKey,
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
