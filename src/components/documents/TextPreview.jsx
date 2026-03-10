import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

/**
 * Text File Preview Component
 * Renders plain text files with syntax highlighting for code
 */
const TextPreview = ({ blobUrl, fileName }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadText = async () => {
      if (!blobUrl) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(blobUrl);
        const content = await response.text();
        setText(content);
      } catch (err) {
        console.error('[TextPreview] Failed to load text:', err);
        setError(err.message || 'Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    loadText();
  }, [blobUrl]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-gray-300">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent mb-4"></div>
        <p>Loading file...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-gray-300">
        <FontAwesomeIcon icon={faTriangleExclamation} className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-red-400 mb-2">Failed to load file</p>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700">
        <span className="font-medium text-white truncate block max-w-full">
          {fileName}
        </span>
      </div>

      {/* Text content */}
      <div className="flex-1 overflow-auto">
        <pre className="p-6 text-sm text-gray-200 font-mono whitespace-pre-wrap break-words">
          {text}
        </pre>
      </div>
    </div>
  );
};

export default TextPreview;
