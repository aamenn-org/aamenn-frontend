/**
 * Download Concurrency Limiter
 * 
 * Limits the number of concurrent download requests to prevent
 * overwhelming the network and browser connection pool.
 * 
 * Uses a queue-based approach with priority support.
 */

interface DownloadTask<T> {
  id: string;
  priority: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

class DownloadLimiter {
  private maxConcurrent: number;
  private activeCount = 0;
  private queue: DownloadTask<any>[] = [];
  private nextId = 0;

  constructor(maxConcurrent: number = 6) {
    // Default to 6 concurrent downloads (browser default for HTTP/1.1)
    // Can be adjusted based on HTTP/2 support and network conditions
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Schedule a download with priority
   * @param downloadFn - Function that performs the download
   * @param priority - Higher number = higher priority (0 = low, 1 = normal, 2 = high)
   * @returns Promise that resolves with the download result
   */
  async schedule<T>(
    downloadFn: () => Promise<T>,
    priority: number = 1
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: DownloadTask<T> = {
        id: `dl_${this.nextId++}`,
        priority,
        execute: downloadFn,
        resolve,
        reject,
      };

      // Insert by priority (higher priority first)
      const insertIndex = this.queue.findIndex((t) => t.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(task);
      } else {
        this.queue.splice(insertIndex, 0, task);
      }

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.activeCount++;

      // Execute task
      task
        .execute()
        .then((result) => {
          task.resolve(result);
        })
        .catch((error) => {
          task.reject(error);
        })
        .finally(() => {
          this.activeCount--;
          this.processQueue();
        });
    }
  }

  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Update max concurrent limit (useful for adapting to network conditions)
   */
  setMaxConcurrent(max: number) {
    this.maxConcurrent = Math.max(1, max);
    this.processQueue();
  }
}

// Singleton instance
let instance: DownloadLimiter | null = null;

export function getDownloadLimiter(): DownloadLimiter {
  if (!instance) {
    // Adjust based on connection type if available
    const maxConcurrent = getOptimalConcurrency();
    instance = new DownloadLimiter(maxConcurrent);
  }
  return instance;
}

/**
 * Determine optimal concurrency based on network conditions
 */
function getOptimalConcurrency(): number {
  // Check if Network Information API is available
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  
  if (connection) {
    const effectiveType = connection.effectiveType;
    
    // Adjust concurrency based on connection speed
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        return 2; // Very limited concurrency for slow connections
      case '3g':
        return 4;
      case '4g':
        return 8; // Higher concurrency for fast connections
      default:
        return 6; // Default
    }
  }
  
  // Default to 6 if Network Information API not available
  return 6;
}

export default DownloadLimiter;
