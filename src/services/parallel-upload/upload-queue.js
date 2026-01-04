/**
 * Upload Queue - Manages parallel uploads with concurrency control
 *
 * Following ente.io's approach:
 * - Configurable concurrency
 * - Progress tracking per file and overall
 * - Retry with exponential backoff
 * - Cancellation support
 */

const DEFAULT_CONCURRENCY = 2; // Reduced to avoid rate limiting
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000;
const UPLOAD_THROTTLE_MS = 300; // Delay between starting uploads

/**
 * Upload state enum
 */
export const UploadState = {
  PENDING: 'pending',
  ENCRYPTING: 'encrypting',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Single upload task
 */
class UploadTask {
  constructor(file, options = {}) {
    this.id = crypto.randomUUID();
    this.file = file;
    this.state = UploadState.PENDING;
    this.progress = 0;
    this.encryptionProgress = 0;
    this.uploadProgress = 0;
    this.error = null;
    this.retryCount = 0;
    this.result = null;
    this.cancelled = false;
    this.abortController = null;
    this.options = options;
  }

  get totalProgress() {
    // Encryption is ~40% of total time, upload is ~60%
    return Math.round(
      this.encryptionProgress * 0.4 + this.uploadProgress * 0.6
    );
  }
}

/**
 * Upload Queue Manager
 */
class UploadQueue {
  constructor(options = {}) {
    this.concurrency = options.concurrency || DEFAULT_CONCURRENCY;
    this.queue = [];
    this.activeUploads = new Map();
    this.completedUploads = new Map();
    this.failedUploads = new Map();
    this.listeners = new Set();
    this.paused = false;
    this.uploadFunction = options.uploadFunction;
    this.encryptFunction = options.encryptFunction;
    this.lastUploadStartTime = 0;
    this.isProcessing = false;
  }

  /**
   * Add files to the upload queue
   */
  addFiles(files, options = {}) {
    const tasks = Array.from(files).map(
      (file) => new UploadTask(file, options)
    );
    this.queue.push(...tasks);
    this._notifyListeners('filesAdded', tasks);
    this._processQueue();
    return tasks.map((t) => t.id);
  }

  /**
   * Process the upload queue with throttling
   */
  async _processQueue() {
    if (this.paused || this.isProcessing) return;

    this.isProcessing = true;

    try {
      while (
        this.activeUploads.size < this.concurrency &&
        this.queue.length > 0
      ) {
        // Throttle: ensure minimum delay between upload starts
        const timeSinceLastUpload = Date.now() - this.lastUploadStartTime;
        if (timeSinceLastUpload < UPLOAD_THROTTLE_MS) {
          await new Promise((resolve) =>
            setTimeout(resolve, UPLOAD_THROTTLE_MS - timeSinceLastUpload)
          );
        }

        const task = this.queue.shift();
        if (task && !task.cancelled) {
          this.lastUploadStartTime = Date.now();
          this._processTask(task);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single upload task
   */
  async _processTask(task) {
    this.activeUploads.set(task.id, task);
    this._notifyListeners('taskStarted', task);

    try {
      // Encryption phase
      task.state = UploadState.ENCRYPTING;
      task.abortController = new AbortController();

      const encryptedResult = await this.encryptFunction(
        task.file,
        (progress) => {
          task.encryptionProgress = progress;
          this._notifyListeners('taskProgress', task);
        },
        task.abortController.signal
      );

      if (task.cancelled) {
        throw new Error('Upload cancelled');
      }

      // Upload phase
      task.state = UploadState.UPLOADING;

      const uploadResult = await this._uploadWithRetry(
        task,
        encryptedResult,
        (progress) => {
          task.uploadProgress = progress;
          this._notifyListeners('taskProgress', task);
        }
      );

      // Success
      task.state = UploadState.COMPLETED;
      task.progress = 100;
      task.result = uploadResult;
      this.completedUploads.set(task.id, task);
      this._notifyListeners('taskCompleted', task);
    } catch (error) {
      if (task.cancelled) {
        task.state = UploadState.CANCELLED;
        this._notifyListeners('taskCancelled', task);
      } else {
        task.state = UploadState.FAILED;
        task.error = error;
        this.failedUploads.set(task.id, task);
        this._notifyListeners('taskFailed', task);
      }
    } finally {
      this.activeUploads.delete(task.id);
      this._processQueue();
    }
  }

  /**
   * Upload with retry logic and rate limit handling
   */
  async _uploadWithRetry(task, encryptedData, onProgress) {
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (task.cancelled) {
          throw new Error('Upload cancelled');
        }

        return await this.uploadFunction(
          encryptedData,
          task.file,
          onProgress,
          task.abortController.signal
        );
      } catch (error) {
        lastError = error;
        task.retryCount = attempt + 1;

        // Check for rate limiting (429)
        const isRateLimited = error.response?.status === 429;

        if (task.cancelled || (!isRateLimited && attempt === MAX_RETRIES)) {
          throw error;
        }

        // Longer delay for rate limiting, exponential backoff for other errors
        let delay;
        if (isRateLimited) {
          // Use Retry-After header if available, otherwise default to 2 seconds
          const retryAfter = error.response?.headers?.['retry-after'];
          delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : 2000 + attempt * 1000;
        } else {
          delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        }

        this._notifyListeners('taskRetrying', {
          task,
          attempt: attempt + 1,
          delay,
          isRateLimited,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Reset upload progress for retry
        task.uploadProgress = 0;
      }
    }

    throw lastError;
  }

  /**
   * Cancel a specific upload
   */
  cancelUpload(taskId) {
    // Check queue
    const queueIndex = this.queue.findIndex((t) => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.cancelled = true;
      task.state = UploadState.CANCELLED;
      this._notifyListeners('taskCancelled', task);
      return true;
    }

    // Check active uploads
    const activeTask = this.activeUploads.get(taskId);
    if (activeTask) {
      activeTask.cancelled = true;
      if (activeTask.abortController) {
        activeTask.abortController.abort();
      }
      return true;
    }

    return false;
  }

  /**
   * Cancel all uploads
   */
  cancelAll() {
    // Cancel queued tasks
    for (const task of this.queue) {
      task.cancelled = true;
      task.state = UploadState.CANCELLED;
      this._notifyListeners('taskCancelled', task);
    }
    this.queue = [];

    // Cancel active tasks
    for (const task of this.activeUploads.values()) {
      task.cancelled = true;
      if (task.abortController) {
        task.abortController.abort();
      }
    }
  }

  /**
   * Pause processing
   */
  pause() {
    this.paused = true;
    this._notifyListeners('queuePaused');
  }

  /**
   * Resume processing
   */
  resume() {
    this.paused = false;
    this._notifyListeners('queueResumed');
    this._processQueue();
  }

  /**
   * Retry failed uploads
   */
  retryFailed() {
    const failedTasks = Array.from(this.failedUploads.values());
    this.failedUploads.clear();

    for (const task of failedTasks) {
      task.state = UploadState.PENDING;
      task.progress = 0;
      task.encryptionProgress = 0;
      task.uploadProgress = 0;
      task.error = null;
      task.retryCount = 0;
      task.cancelled = false;
      this.queue.push(task);
    }

    this._notifyListeners('retryingFailed', failedTasks);
    this._processQueue();
  }

  /**
   * Add event listener
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  _notifyListeners(event, data) {
    const stats = this.getStats();
    for (const listener of this.listeners) {
      try {
        listener(event, data, stats);
      } catch (error) {
        console.error('[UploadQueue] Listener error:', error);
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const activeList = Array.from(this.activeUploads.values());
    const totalActive = activeList.length;
    const totalQueued = this.queue.length;
    const totalCompleted = this.completedUploads.size;
    const totalFailed = this.failedUploads.size;
    const total = totalActive + totalQueued + totalCompleted + totalFailed;

    // Calculate overall progress
    let totalProgress = 0;
    for (const task of activeList) {
      totalProgress += task.totalProgress;
    }
    totalProgress += totalCompleted * 100;

    const overallProgress = total > 0 ? Math.round(totalProgress / total) : 0;

    return {
      total,
      queued: totalQueued,
      active: totalActive,
      completed: totalCompleted,
      failed: totalFailed,
      overallProgress,
      paused: this.paused,
      activeTasks: activeList.map((t) => ({
        id: t.id,
        name: t.file.name,
        state: t.state,
        progress: t.totalProgress,
      })),
    };
  }

  /**
   * Clear completed and failed uploads
   */
  clearHistory() {
    this.completedUploads.clear();
    this.failedUploads.clear();
    this._notifyListeners('historyCleared');
  }
}

export default UploadQueue;
