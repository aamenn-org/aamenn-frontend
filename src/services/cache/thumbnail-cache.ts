/**
 * Thumbnail Cache Service
 *
 * Caches DECRYPTED thumbnails and images for offline access.
 * This integrates with the multi-layer cache system.
 *
 * Flow:
 * 1. Check L1 (memory) → instant return
 * 2. Check L2 (IndexedDB) → fast return
 * 3. Download + decrypt + cache → slower but persists
 */

import Dexie from 'dexie';
import { fileService } from '../index';
import { decryptFileKey, decryptFile } from '../../utils/crypto';

// Debug logging - disabled in production
const DEBUG = false; // Set to true to enable cache debug logs
const log = (...args: unknown[]) =>
  DEBUG && console.log('[ThumbnailCache]', ...args);

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

  constructor(maxSize: number) {
    this.maxSize = maxSize;
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
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
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

  constructor() {
    this.db = new DecryptedCacheDB();
    this.memoryCache = new SimpleLRUCache<string>(500); // 500 thumbnails in memory
    this.imageMemoryCache = new SimpleLRUCache<string>(50); // 50 full images in memory
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.db.open().then(() => {
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
    cipherThumbKey: string,
    masterKey: CryptoKey,
    blurhash?: string
  ): Promise<string> {
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
      cipherThumbKey,
      masterKey,
      blurhash
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

    if (this.memoryCache.has(fileId)) return true;

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
    cipherThumbKey: string,
    masterKey: CryptoKey,
    blurhash?: string
  ): Promise<string> {
    try {
      log(`L3 FETCH: ${fileId}`);

      // Download encrypted thumbnail
      const encryptedData = await fileService.downloadFileContent(thumbnailUrl);
      log(`Downloaded encrypted data: ${encryptedData.byteLength} bytes`);

      // Decrypt thumbnail key
      const thumbKey = await decryptFileKey(cipherThumbKey, masterKey);

      // Extract IV and decrypt
      const encryptedArray = new Uint8Array(encryptedData);
      const iv = encryptedArray.slice(0, 12);
      const ciphertext = encryptedArray.slice(12);

      log(`IV: ${iv.length} bytes, Ciphertext: ${ciphertext.length} bytes`);

      const decryptedData = await decryptFile(ciphertext.buffer, thumbKey, iv);

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

    // L2: Check IndexedDB for cached full image
    const dbCached = await this.db.images.get(cacheKey);
    if (dbCached) {
      const url = URL.createObjectURL(dbCached.blob);
      this.imageMemoryCache.set(cacheKey, url); // Promote to L1
      log(`Full image L2 HIT: ${fileId}`);
      return url;
    }

    // L3: Download, decrypt, and cache
    const fetchPromise = (async () => {
      log(`Full image L3 FETCH: ${fileId}`);

      const encryptedData = await fileService.downloadFileContent(downloadUrl);
      const fileKey = await decryptFileKey(cipherFileKey, masterKey);

      const encryptedArray = new Uint8Array(encryptedData);
      const iv = encryptedArray.slice(0, 12);
      const ciphertext = encryptedArray.slice(12);

      const decryptedData = await decryptFile(ciphertext.buffer, fileKey, iv);
      const blob = new Blob([decryptedData], { type: mimeType });
      const url = URL.createObjectURL(blob);

      // Store in L1 memory
      this.imageMemoryCache.set(cacheKey, url);

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

    // L2: Check IndexedDB
    const dbCached = await this.db.images.get(cacheKey);
    if (dbCached) {
      const url = URL.createObjectURL(dbCached.blob);
      this.imageMemoryCache.set(cacheKey, url); // Promote to L1
      log(`Medium thumb L2 HIT: ${fileId}`);
      return url;
    }

    // L3: Download, decrypt, cache
    const fetchPromise = (async () => {
      log(`Medium thumb L3 FETCH: ${fileId}`);

      const encryptedData = await fileService.downloadFileContent(
        thumbMediumUrl
      );
      const thumbKey = await decryptFileKey(cipherThumbMediumKey, masterKey);

      const encryptedArray = new Uint8Array(encryptedData);
      const iv = encryptedArray.slice(0, 12);
      const ciphertext = encryptedArray.slice(12);

      const decryptedData = await decryptFile(ciphertext.buffer, thumbKey, iv);
      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      // Store in L1
      this.imageMemoryCache.set(cacheKey, url);

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
   * Batch preload with metadata from API response.
   * Designed for predictive loading of 10+ images.
   * Only loads MEDIUM thumbnails - full images load on demand.
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

    // Only preload medium thumbnails (not full images)
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
