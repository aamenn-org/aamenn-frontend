/**
 * Download Concurrency Limiter
 *
 * Limits the number of concurrent download requests to prevent
 * overwhelming the network and browser connection pool.
 *
 * Backed by p-queue with priority support.
 */

import PQueue from 'p-queue';

/**
 * Determine optimal concurrency based on network conditions.
 * Uses the Network Information API where available.
 */
export function getOptimalConcurrency(): number {
  type NetworkInformation = { effectiveType?: string };
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;

  if (connection?.effectiveType) {
    switch (connection.effectiveType) {
      case 'slow-2g':
      case '2g':
        return 2;
      case '3g':
        return 4;
      case '4g':
        return 8;
      default:
        return 6;
    }
  }

  return 6;
}

// Singleton p-queue instance
let instance: PQueue | null = null;

export function getDownloadLimiter(): PQueue {
  if (!instance) {
    instance = new PQueue({ concurrency: getOptimalConcurrency() });
  }
  return instance;
}
