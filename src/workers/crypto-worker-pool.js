/**
 * Crypto Worker Pool - Manages multiple crypto workers for parallel processing
 *
 * Following ente.io's approach:
 * - Pool of workers for parallel encryption
 * - Round-robin task distribution
 * - Automatic worker lifecycle management
 * - Priority queue (high priority tasks execute first)
 * - Cancellation support (cancel pending tasks)
 */

// Use fewer workers to avoid overwhelming the system
const DEFAULT_WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 2, 4);

// Priority levels - higher number = higher priority
const PRIORITY = {
  LOW: 0, // Background preloading
  NORMAL: 1, // Default
  HIGH: 2, // Visible on screen
};

// Debug logging - disabled in production
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[CryptoWorkerPool]', ...args);

class CryptoWorkerPool {
  constructor(workerCount = DEFAULT_WORKER_COUNT) {
    this.workers = [];
    this.workerCount = workerCount;
    this.taskQueue = []; // Now sorted by priority
    this.pendingTasks = new Map();
    this.nextTaskId = 0;
    this.nextWorkerIndex = 0;
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize the worker pool
   */
  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initWorkers();
    await this.initPromise;
    this.initialized = true;
  }

  async _initWorkers() {
    const workerPromises = [];

    for (let i = 0; i < this.workerCount; i++) {
      const workerIndex = i;

      const workerPromise = new Promise((resolve, reject) => {
        let worker;

        try {
          worker = new Worker(new URL('./crypto.worker.js', import.meta.url), {
            type: 'module',
          });
        } catch (err) {
          console.error(
            `[CryptoWorkerPool] Failed to create worker ${workerIndex}:`,
            err
          );
          reject(err);
          return;
        }

        const timeout = setTimeout(() => {
          console.error(
            `[CryptoWorkerPool] Worker ${workerIndex} initialization timeout`
          );
          reject(new Error(`Worker ${workerIndex} initialization timeout`));
        }, 10000);

        let isReady = false;

        // Single message handler that handles both READY/PONG and subsequent messages
        const messageHandler = (e) => {
          if (!isReady && (e.data.type === 'READY' || e.data.type === 'PONG')) {
            isReady = true;
            clearTimeout(timeout);
            log(`Worker ${workerIndex} ready`);
            resolve({ worker, index: workerIndex });
          } else if (isReady) {
            this._handleWorkerMessage(e, workerIndex);
          }
        };

        worker.onmessage = messageHandler;

        worker.onerror = (error) => {
          clearTimeout(timeout);
          console.error(
            `[CryptoWorkerPool] Worker ${workerIndex} error:`,
            error
          );
          reject(error);
        };

        // Send a ping after a short delay to check if worker is ready
        // This handles cases where READY was sent before handler was attached
        setTimeout(() => {
          if (!isReady) {
            worker.postMessage({ type: 'PING', id: -1 });
          }
        }, 100);
      });

      workerPromises.push(workerPromise);
    }

    const results = await Promise.all(workerPromises);

    // Store workers after all are ready
    for (const { worker, index } of results) {
      this.workers[index] = {
        worker,
        busy: false,
        currentTask: null,
      };
    }

    log(`Initialized ${this.workerCount} workers`);
  }

  /**
   * Handle messages from workers
   */
  _handleWorkerMessage(e, workerIndex) {
    const { type, id, result, error, progress, stage } = e.data;

    if (type === 'READY') return;

    const task = this.pendingTasks.get(id);
    if (!task) {
      console.warn(
        `[CryptoWorkerPool] Received message for unknown task ${id}`
      );
      return;
    }

    if (type === 'PROGRESS') {
      if (task.onProgress) {
        task.onProgress(progress, stage);
      }
      return;
    }

    if (type === 'ERROR') {
      task.reject(new Error(error.message));
      this.pendingTasks.delete(id);
      this._markWorkerFree(workerIndex);
      return;
    }

    // Result message
    if (type.endsWith('_RESULT')) {
      task.resolve(result);
      this.pendingTasks.delete(id);
      this._markWorkerFree(workerIndex);
    }
  }

  /**
   * Handle worker errors
   */
  _handleWorkerError(error, workerIndex) {
    console.error(`[CryptoWorkerPool] Worker ${workerIndex} error:`, error);

    const workerInfo = this.workers[workerIndex];
    if (workerInfo.currentTask) {
      const task = this.pendingTasks.get(workerInfo.currentTask);
      if (task) {
        task.reject(error);
        this.pendingTasks.delete(workerInfo.currentTask);
      }
    }

    this._markWorkerFree(workerIndex);
  }

  /**
   * Mark a worker as free and process next task
   */
  _markWorkerFree(workerIndex) {
    this.workers[workerIndex].busy = false;
    this.workers[workerIndex].currentTask = null;
    this._processQueue();
  }

  /**
   * Process the task queue (priority-aware)
   * Higher priority tasks are processed first
   */
  _processQueue() {
    while (this.taskQueue.length > 0) {
      const freeWorkerIndex = this.workers.findIndex((w) => !w.busy);
      if (freeWorkerIndex === -1) break;

      // Find highest priority task (already sorted, but check for cancelled)
      let taskIndex = -1;
      for (let i = 0; i < this.taskQueue.length; i++) {
        const task = this.taskQueue[i];
        // Skip cancelled tasks
        if (task.cancelled) {
          this.taskQueue.splice(i, 1);
          this.pendingTasks.delete(task.id);
          i--;
          continue;
        }
        taskIndex = i;
        break;
      }

      if (taskIndex === -1) break;

      const task = this.taskQueue.splice(taskIndex, 1)[0];
      this._assignTask(task, freeWorkerIndex);
    }
  }

  /**
   * Insert task into queue maintaining priority order (highest first)
   */
  _insertByPriority(task) {
    const priority = task.priority ?? PRIORITY.NORMAL;

    // Find insertion point (insert before first lower priority task)
    let insertIndex = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      if ((this.taskQueue[i].priority ?? PRIORITY.NORMAL) < priority) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, task);
  }

  /**
   * Assign a task to a specific worker
   */
  _assignTask(task, workerIndex) {
    const workerInfo = this.workers[workerIndex];
    workerInfo.busy = true;
    workerInfo.currentTask = task.id;

    workerInfo.worker.postMessage(
      { type: task.type, id: task.id, payload: task.payload },
      task.transferables || []
    );
  }

  /**
   * Submit a task to the pool
   * @param {string} type - Task type
   * @param {object} payload - Task payload
   * @param {Array} transferables - Transferable objects
   * @param {function} onProgress - Progress callback
   * @param {object} options - Additional options
   * @param {number} options.priority - Task priority (PRIORITY.LOW/NORMAL/HIGH)
   * @param {AbortSignal} options.signal - AbortSignal for cancellation
   * @returns {Promise} Resolves with task result
   */
  async submitTask(
    type,
    payload,
    transferables = [],
    onProgress = null,
    options = {}
  ) {
    await this.init();

    const { priority = PRIORITY.NORMAL, signal } = options;

    return new Promise((resolve, reject) => {
      // Check if already aborted
      if (signal?.aborted) {
        reject(new DOMException('Task cancelled', 'AbortError'));
        return;
      }

      const id = this.nextTaskId++;
      const task = {
        id,
        type,
        payload,
        transferables,
        resolve,
        reject,
        onProgress,
        priority,
        cancelled: false,
      };

      this.pendingTasks.set(id, task);

      // Handle abort signal
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            task.cancelled = true;
            // If task is still in queue, it will be skipped
            // If task is already running, we can't stop the worker, but we reject the promise
            if (this.pendingTasks.has(id)) {
              this.pendingTasks.delete(id);
              reject(new DOMException('Task cancelled', 'AbortError'));
            }
          },
          { once: true }
        );
      }

      // Find a free worker or queue the task by priority
      const freeWorkerIndex = this.workers.findIndex((w) => !w.busy);
      if (freeWorkerIndex !== -1) {
        this._assignTask(task, freeWorkerIndex);
      } else {
        this._insertByPriority(task);
      }
    });
  }

  /**
   * Encrypt a file using the worker pool
   */
  async encryptFile(fileData, masterKeyBytes, filename, mimeType, onProgress) {
    return this.submitTask(
      'ENCRYPT_FILE',
      { fileData, masterKeyBytes, filename, mimeType },
      [fileData],
      onProgress
    );
  }

  /**
   * Encrypt a thumbnail using the worker pool
   */
  async encryptThumbnail(thumbnailData, masterKeyBytes, thumbType) {
    return this.submitTask(
      'ENCRYPT_THUMBNAIL',
      { thumbnailData, masterKeyBytes, type: thumbType },
      [thumbnailData]
    );
  }

  /**
   * Compute SHA1 hash (for B2 upload verification)
   * @param {ArrayBuffer} data - Data to hash
   * @returns {Promise<string>} Hex-encoded SHA1 hash
   */
  async computeSHA1(data) {
    const result = await this.submitTask('COMPUTE_SHA1', { data }, [data]);
    return result.hash;
  }

  /**
   * Compute SHA256 hash (for duplicate detection)
   * @param {ArrayBuffer} data - Data to hash
   * @returns {Promise<string>} Hex-encoded SHA256 hash
   */
  async computeSHA256(data) {
    const result = await this.submitTask('COMPUTE_SHA256', { data }, [data]);
    return result.hash;
  }

  /**
   * Decrypt file content in worker (for viewing images/videos)
   * This offloads CPU-intensive decryption from the main thread
   * @param {ArrayBuffer} encryptedData - Encrypted file data (IV + ciphertext)
   * @param {string} cipherFileKeyBase64 - Encrypted file key (base64)
   * @param {ArrayBuffer} masterKeyBytes - Master key raw bytes
   * @param {object} options - Optional settings
   * @param {number} options.priority - Task priority (PRIORITY.LOW/NORMAL/HIGH)
   * @param {AbortSignal} options.signal - AbortSignal for cancellation
   * @returns {Promise<ArrayBuffer>} Decrypted file data
   */
  async decryptFile(
    encryptedData,
    cipherFileKeyBase64,
    masterKeyBytes,
    options = {}
  ) {
    const result = await this.submitTask(
      'DECRYPT_FILE',
      { encryptedData, cipherFileKeyBase64, masterKeyBytes },
      [encryptedData, masterKeyBytes],
      null, // onProgress
      options
    );
    return result.decryptedData;
  }

  /**
   * Warm up the worker pool by initializing workers and running a test task
   * This ensures workers are fully ready before the first real upload
   * @returns {Promise<void>}
   */
  async warmup() {
    // Initialize workers if not already done
    await this.init();

    // Run a small test task to ensure workers are responsive
    // This also triggers JIT compilation of crypto code paths
    const testData = new Uint8Array(64).buffer; // Small 64-byte test
    try {
      await this.computeSHA256(testData);
      log('Warmup complete - workers ready');
    } catch (error) {
      console.warn('[CryptoWorkerPool] Warmup test task failed:', error);
      // Don't throw - workers are still initialized
    }
  }

  /**
   * Check if the pool is initialized and ready
   * @returns {boolean}
   */
  isReady() {
    return this.initialized && this.workers.length > 0;
  }

  /**
   * Terminate all workers
   */
  terminate() {
    for (const { worker } of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.initialized = false;
    this.initPromise = null;
    this.pendingTasks.clear();
    this.taskQueue = [];
    log('Terminated all workers');
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queuedTasks: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size,
      isReady: this.isReady(),
    };
  }
}

// Singleton instance
let instance = null;

export function getCryptoWorkerPool() {
  if (!instance) {
    instance = new CryptoWorkerPool();
  }
  return instance;
}

export function terminateCryptoWorkerPool() {
  if (instance) {
    instance.terminate();
    instance = null;
  }
}

// Export priority constants for external use
export { PRIORITY };

export default CryptoWorkerPool;
