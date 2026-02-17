/**
 * Upload Prewarmer Service
 *
 * Pre-warms workers and prepares encryption infrastructure before user starts uploading.
 * This reduces perceived latency when the user initiates their first upload.
 *
 * Features:
 * - Lazy initialization of crypto worker pool
 * - Runs a small test task to ensure workers are fully ready
 * - Singleton pattern for app-wide access
 */

import { getCryptoWorkerPool } from '../workers';

// Debug logging
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[UploadPrewarmer]', ...args);

class UploadPrewarmer {
  constructor() {
    this.isWarmedUp = false;
    this.warmupPromise = null;
    this.warmupStartTime = null;
  }

  /**
   * Warm up the worker pool and prepare for uploads
   * This is a non-blocking operation that can be called after login
   * @returns {Promise<void>}
   */
  async warmup() {
    // Already warmed up
    if (this.isWarmedUp) {
      log('Already warmed up, skipping');
      return;
    }

    // Warmup in progress
    if (this.warmupPromise) {
      log('Warmup already in progress, waiting...');
      return this.warmupPromise;
    }

    this.warmupStartTime = performance.now();
    log('Starting warmup...');

    this.warmupPromise = this._doWarmup();

    try {
      await this.warmupPromise;
      this.isWarmedUp = true;
      const duration = Math.round(performance.now() - this.warmupStartTime);
      log(`Warmup complete in ${duration}ms`);
    } catch (error) {
      console.warn('[UploadPrewarmer] Warmup failed:', error.message);
      // Don't throw - warmup failure shouldn't break the app
    } finally {
      this.warmupPromise = null;
    }
  }

  /**
   * Internal warmup implementation
   */
  async _doWarmup() {
    const workerPool = getCryptoWorkerPool();

    // Step 1: Initialize the worker pool (creates workers)
    await workerPool.warmup();

    log('Worker pool initialized and tested');
  }

  /**
   * Check if the system is warmed up and ready for fast uploads
   * @returns {boolean}
   */
  isReady() {
    return this.isWarmedUp;
  }

  /**
   * Reset warmup state (useful for testing or after logout)
   */
  reset() {
    this.isWarmedUp = false;
    this.warmupPromise = null;
    this.warmupStartTime = null;
    log('Warmup state reset');
  }

  /**
   * Get warmup statistics
   * @returns {Object}
   */
  getStats() {
    const workerPool = getCryptoWorkerPool();
    return {
      isWarmedUp: this.isWarmedUp,
      workerStats: workerPool.getStats(),
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton UploadPrewarmer instance
 * @returns {UploadPrewarmer}
 */
export function getUploadPrewarmer() {
  if (!instance) {
    instance = new UploadPrewarmer();
  }
  return instance;
}

/**
 * Convenience function to trigger warmup (non-blocking)
 * Safe to call multiple times - will only warm up once
 */
export function triggerWarmup() {
  const prewarmer = getUploadPrewarmer();
  // Fire and forget - don't await
  prewarmer.warmup().catch(() => {
    // Errors are already logged in warmup()
  });
}

/**
 * Reset the prewarmer (call on logout)
 */
export function resetPrewarmer() {
  if (instance) {
    instance.reset();
  }
}
