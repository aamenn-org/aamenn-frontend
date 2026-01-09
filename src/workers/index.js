/**
 * Web Workers Exports
 */

export {
  default as CryptoWorkerPool,
  getCryptoWorkerPool,
  terminateCryptoWorkerPool,
  PRIORITY,
} from './crypto-worker-pool';

// Utility functions (for chunked file processing)
export { readFileInChunks } from './crypto-worker-utils';
