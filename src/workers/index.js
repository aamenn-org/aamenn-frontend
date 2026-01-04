/**
 * Web Workers Exports
 */

export {
  default as CryptoWorkerPool,
  getCryptoWorkerPool,
  terminateCryptoWorkerPool,
} from './crypto-worker-pool';

// Utility functions (for chunked file processing)
export { readFileInChunks } from './crypto-worker-utils';
