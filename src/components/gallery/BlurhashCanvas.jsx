import { useEffect, useRef, useState } from 'react';
import { decode } from 'blurhash';

/**
 * BlurhashCanvas component - displays a blurhash as a canvas placeholder
 * @param {string} hash - The blurhash string
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} punch - Brightness multiplier (default: 1)
 * @param {string} className - Additional CSS classes
 */
const BlurhashCanvas = ({
  hash,
  width = 32,
  height = 32,
  punch = 1,
  className = '',
}) => {
  const canvasRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hash || !canvasRef.current) return;

    try {
      // Decode blurhash to pixels
      const pixels = decode(hash, width, height, punch);

      // Get canvas context
      const ctx = canvasRef.current.getContext('2d');

      // Create image data
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(pixels);

      // Draw to canvas
      ctx.putImageData(imageData, 0, 0);
      setError(false);
    } catch (err) {
      console.error('Failed to decode blurhash:', err);
      setError(true);
    }
  }, [hash, width, height, punch]);

  // If error or no hash, show a gray placeholder
  if (error || !hash) {
    return (
      <div
        className={`bg-gray-200 ${className}`}
        style={{ width: '100%', height: '100%' }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`w-full h-full object-cover ${className}`}
      style={{ imageRendering: 'auto' }}
    />
  );
};

export default BlurhashCanvas;
