import PdfPreview from './PdfPreview';
import DocxPreview from './DocxPreview';
import TextPreview from './TextPreview';
import { isPDF, isDOCX, isTextFile } from '../../utils/thumbnail';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFile } from '@fortawesome/free-solid-svg-icons';

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
      <FontAwesomeIcon icon={faFile} className="w-16 h-16 text-gray-500 mb-4" />
      <p className="text-gray-400 mb-2">Preview not available</p>
      <p className="text-sm text-gray-500">
        This file type cannot be previewed in the browser
      </p>
      <p className="text-sm text-gray-500 mt-1">({mimeType})</p>
    </div>
  );
};

export default DocumentPreview;
