/**
 * Cache Types and Interfaces
 *
 * Defines the type system for the multi-layer caching architecture.
 */

// ============================================================================
// Cache Item Types
// ============================================================================

export interface CacheItem<T = Blob> {
  /** Unique identifier (fileId) */
  id: string;
  /** The cached data */
  data: T;
  /** When the item was cached */
  timestamp: number;
  /** Size in bytes */
  size: number;
  /** Optional metadata */
  metadata?: CacheMetadata;
}

export interface CacheMetadata {
  /** Original filename */
  filename?: string;
  /** MIME type */
  mimeType?: string;
  /** Image dimensions */
  width?: number;
  height?: number;
  /** BlurHash for placeholder */
  blurhash?: string;
}

// ============================================================================
// Cache Entry Types (for IndexedDB)
// ============================================================================

export interface ThumbnailCacheEntry {
  /** File ID (primary key) */
  fileId: string;
  /** Thumbnail blob data */
  blob: Blob;
  /** When cached */
  timestamp: number;
  /** Size in bytes */
  size: number;
  /** BlurHash for fast placeholder */
  blurhash?: string;
}

export interface ImageCacheEntry {
  /** File ID (primary key) */
  fileId: string;
  /** Full image blob data */
  blob: Blob;
  /** When cached */
  timestamp: number;
  /** Size in bytes */
  size: number;
  /** Time-to-live in milliseconds */
  ttl?: number;
}

// ============================================================================
// Cache Configuration
// ============================================================================

export interface CacheConfig {
  /** L1: In-memory thumbnail cache capacity */
  thumbnailMemoryCapacity: number;
  /** L1: In-memory image cache capacity */
  imageMemoryCapacity: number;
  /** L2: IndexedDB thumbnail cache max size in bytes */
  thumbnailDiskMaxSize: number;
  /** L2: IndexedDB image cache max size in bytes */
  imageDiskMaxSize: number;
  /** L3: Maximum concurrent downloads */
  maxConcurrentDownloads: number;
  /** L3: Download timeout in milliseconds */
  downloadTimeout: number;
  /** TTL for cached items in milliseconds (default: 7 days) */
  defaultTTL: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  thumbnailMemoryCapacity: 2000, // Increased from 1000 for 10K scale
  imageMemoryCapacity: 100,
  thumbnailDiskMaxSize: 500 * 1024 * 1024, // 500MB
  imageDiskMaxSize: 2 * 1024 * 1024 * 1024, // 2GB
  maxConcurrentDownloads: 6,
  downloadTimeout: 30000, // 30 seconds
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// Cache Statistics
// ============================================================================

export interface CacheStats {
  /** L1 memory cache stats */
  memory: {
    thumbnailCount: number;
    thumbnailSize: number;
    imageCount: number;
    imageSize: number;
  };
  /** L2 IndexedDB cache stats */
  disk: {
    thumbnailCount: number;
    thumbnailSize: number;
    imageCount: number;
    imageSize: number;
  };
  /** L3 Network queue stats */
  network: {
    pendingDownloads: number;
    activeDownloads: number;
  };
  /** Hit/miss statistics */
  hits: {
    l1: number;
    l2: number;
    l3: number;
    misses: number;
  };
}

// ============================================================================
// Download Task Types
// ============================================================================

export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DownloadTask {
  /** Unique task ID */
  id: string;
  /** File ID to download */
  fileId: string;
  /** Type of download */
  type: 'thumbnail' | 'image';
  /** Task priority */
  priority: TaskPriority;
  /** Current status */
  status: TaskStatus;
  /** Abort controller for cancellation */
  abortController: AbortController;
  /** Promise that resolves when task completes */
  promise: Promise<Blob>;
  /** Resolve function */
  resolve: (blob: Blob) => void;
  /** Reject function */
  reject: (error: Error) => void;
  /** Number of retry attempts */
  retryCount: number;
  /** When the task was created */
  createdAt: number;
}

// ============================================================================
// Cache Events
// ============================================================================

export type CacheEventType =
  | 'item-added'
  | 'item-removed'
  | 'item-evicted'
  | 'cache-cleared'
  | 'download-started'
  | 'download-completed'
  | 'download-failed';

export interface CacheEvent {
  type: CacheEventType;
  fileId?: string;
  cacheLayer?: 'l1' | 'l2' | 'l3';
  timestamp: number;
}

export type CacheEventListener = (event: CacheEvent) => void;
