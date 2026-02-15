import { useState, useEffect } from 'react';
import mammoth from 'mammoth';

/**
 * DOCX Preview Component
 * Converts DOCX to HTML using mammoth and renders it
 */
const DocxPreview = ({ blobUrl, fileName }) => {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDocx = async () => {
      if (!blobUrl) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch the blob
        const response = await fetch(blobUrl);
        const arrayBuffer = await response.arrayBuffer();

        // Convert DOCX to HTML
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setHtml(result.value);

        // Log any warnings
        if (result.messages.length > 0) {
          console.warn('[DocxPreview] Conversion warnings:', result.messages);
        }
      } catch (err) {
        console.error('[DocxPreview] Failed to convert DOCX:', err);
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    loadDocx();
  }, [blobUrl]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-gray-300">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent mb-4"></div>
        <p>Converting document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-gray-300">
        <svg
          className="w-16 h-16 text-red-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-red-400 mb-2">Failed to load document</p>
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

      {/* Document content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div
            className="docx-content prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              color: '#e4e4e7',
              lineHeight: '1.75',
            }}
          />
        </div>
      </div>

      <style>{`
        .docx-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        .docx-content p {
          margin-bottom: 1em;
          color: #e4e4e7;
        }
        .docx-content h1, .docx-content h2, .docx-content h3, 
        .docx-content h4, .docx-content h5, .docx-content h6 {
          color: #ffffff;
          font-weight: 600;
          margin-top: 1.5em;
          margin-bottom: 0.75em;
        }
        .docx-content h1 { font-size: 2em; }
        .docx-content h2 { font-size: 1.5em; }
        .docx-content h3 { font-size: 1.25em; }
        .docx-content ul, .docx-content ol {
          margin-left: 1.5em;
          margin-bottom: 1em;
          color: #e4e4e7;
        }
        .docx-content li {
          margin-bottom: 0.5em;
        }
        .docx-content table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 1em;
        }
        .docx-content table td, .docx-content table th {
          border: 1px solid #52525b;
          padding: 0.5em;
          color: #e4e4e7;
        }
        .docx-content table th {
          background-color: #27272a;
          font-weight: 600;
        }
        .docx-content a {
          color: #60a5fa;
          text-decoration: underline;
        }
        .docx-content strong {
          font-weight: 600;
          color: #ffffff;
        }
        .docx-content em {
          font-style: italic;
        }
      `}</style>
    </div>
  );
};

export default DocxPreview;
