import PdfPreview from './PdfPreview';
import DocxPreview from './DocxPreview';
import TextPreview from './TextPreview';
import { isPDF, isDOCX, isTextFile } from '../../utils/thumbnail';

/**
 * Document Preview Component
 * Routes to appropriate renderer based on MIME type
 */
const DocumentPreview = ({ blobUrl, mimeType, fileName }) => {
  if (!blobUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-gray-300">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent mb-4"></div>
        <p>Loading document...</p>
      </div>
    );
  }

  // Route to appropriate preview component
  if (isPDF(mimeType)) {
    return <PdfPreview blobUrl={blobUrl} fileName={fileName} />;
  }

  if (isDOCX(mimeType)) {
    return <DocxPreview blobUrl={blobUrl} fileName={fileName} />;
  }

  if (isTextFile(mimeType)) {
    return <TextPreview blobUrl={blobUrl} fileName={fileName} />;
  }

  // Unsupported format
  return (
    <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-gray-300">
      <svg
        className="w-16 h-16 text-gray-500 mb-4"
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
      <p className="text-gray-400 mb-2">Preview not available</p>
      <p className="text-sm text-gray-500">
        This file type cannot be previewed in the browser
      </p>
      <p className="text-sm text-gray-500 mt-1">({mimeType})</p>
    </div>
  );
};

export default DocumentPreview;
