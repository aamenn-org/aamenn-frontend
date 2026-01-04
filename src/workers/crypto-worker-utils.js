/**
 * Crypto Worker Utilities
 *
 * Helper functions for working with the crypto worker pool
 */

/**
 * Read file in chunks for memory-efficient processing
 *
 * @param {File} file - The file to read
 * @param {number} chunkSize - Size of each chunk in bytes (default 4MB)
 * @param {Function} onChunk - Callback for each chunk
 * @param {Function} onProgress - Progress callback (0-100)
 */
export async function readFileInChunks(
  file,
  chunkSize = 4 * 1024 * 1024,
  onChunk,
  onProgress
) {
  const totalSize = file.size;
  let offset = 0;
  let chunkIndex = 0;

  while (offset < totalSize) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, totalSize));
    const arrayBuffer = await chunk.arrayBuffer();

    await onChunk(arrayBuffer, chunkIndex, offset, totalSize);

    offset += chunkSize;
    chunkIndex++;

    if (onProgress) {
      onProgress(Math.min(100, Math.round((offset / totalSize) * 100)));
    }
  }
}
