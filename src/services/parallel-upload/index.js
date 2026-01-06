/**
 * Parallel Upload Service
 *
 * DEPRECATED: This module has been replaced by:
 * - src/workers/crypto-worker-pool.js (enhanced worker pool)
 * - src/hooks/useUpload.js (upload hook with worker integration)
 *
 * The new implementation provides:
 * - SHA-256/SHA-1 hashing in workers
 * - Compression support
 * - Batch thumbnail encryption
 * - Priority task queue
 * - Early duplicate detection
 */

// Re-export from hooks for backward compatibility
export { UploadStatus as UploadState } from '../../hooks/useUpload';
