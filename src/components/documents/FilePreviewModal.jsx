import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context';
import { fileService } from '../../services';
import { decryptFilename, encryptFilename } from '../../utils/crypto';
import { isDocumentPreviewable } from '../../utils/thumbnail';
import { useDecryptedBlobUrl } from '../../hooks/useDecryptedBlobUrl';
import DocumentPreview from './DocumentPreview';
import RenameModal from '../gallery/RenameModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFile,
  faPen,
  faDownload,
  faXmark,
  faTriangleExclamation,
  faChevronLeft,
  faChevronRight,
  faFileZipper,
} from '@fortawesome/free-solid-svg-icons';

/**
 * File Preview Modal
 * Full-screen overlay for previewing documents with next/prev navigation
 */
const FilePreviewModal = ({
  file,
  files = [],
  isOpen,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentIndex,
}) => {
  const { getMasterKey } = useAuth();
  const [fileData, setFileData] = useState(null);
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [metadataError, setMetadataError] = useState(null);
  const [decryptedFileName, setDecryptedFileName] = useState(null);

  const fileId = file?.fileId || file?.id;
  const mimeType = file?.mimeType || 'application/octet-stream';

  // Decrypt filename
  useEffect(() => {
    const decrypt = async () => {
      if (!file?.fileNameEncrypted || !getMasterKey()) {
        setDecryptedFileName(null);
        return;
      }
      try {
        const name = await decryptFilename(
          file.fileNameEncrypted,
          getMasterKey(),
        );
        setDecryptedFileName(name);
      } catch (err) {
        console.warn('[FilePreviewModal] Failed to decrypt filename:', err);
        setDecryptedFileName(null);
      }
    };
    decrypt();
  }, [file?.fileNameEncrypted, getMasterKey]);

  const fileName = decryptedFileName || 'Document';

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  // Handle rename
  const handleRename = async (newName) => {
    if (!fileId || !getMasterKey()) return;

    setIsRenaming(true);
    try {
      const masterKey = getMasterKey();
      const encryptedName = await encryptFilename(newName, masterKey);

      await fileService.updateFile(fileId, {
        fileNameEncrypted: encryptedName,
      });

      // Update local state
      setDecryptedFileName(newName);

      // Update file object
      if (file) {
        file.fileNameEncrypted = encryptedName;
      }
    } catch (err) {
      console.error('[FilePreviewModal] Failed to rename file:', err);
      throw err;
    } finally {
      setIsRenaming(false);
    }
  };

  // Load file metadata
  useEffect(() => {
    const loadMetadata = async () => {
      if (!isOpen || !fileId) return;

      setLoadingMetadata(true);
      setMetadataError(null);

      try {
        const data = await fileService.getFile(fileId);
        setFileData(data);
      } catch (err) {
        console.error('[FilePreviewModal] Failed to load metadata:', err);
        setMetadataError(err.message || 'Failed to load file metadata');
      } finally {
        setLoadingMetadata(false);
      }
    };

    loadMetadata();
  }, [isOpen, fileId]);

  const canPreview = isDocumentPreviewable(mimeType);

  // Decrypt and create blob URL — only for types that can actually be previewed
  const {
    blobUrl,
    loading: decryptLoading,
    error: decryptError,
    retry,
  } = useDecryptedBlobUrl({
    downloadUrl: fileData?.downloadUrl,
    cipherFileKey: fileData?.cipherFileKey,
    masterKey: getMasterKey(),
    mimeType: mimeType,
    enabled: isOpen && !!fileData && canPreview,
  });

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasNext, hasPrev, onNext, onPrev, onClose]);

  if (!isOpen) return null;

  const loading = canPreview && (loadingMetadata || decryptLoading);
  const error = metadataError || decryptError;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          {/* File info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FontAwesomeIcon
              icon={faFile}
              className="w-5 h-5 text-gray-400 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-medium truncate">{fileName}</h2>
              {files.length > 1 && (
                <p className="text-sm text-gray-400">
                  {currentIndex + 1} of {files.length}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Rename button */}
            <button
              onClick={() => setShowRenameModal(true)}
              className="p-2 text-gray-300 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              title="Rename"
            >
              <FontAwesomeIcon icon={faPen} className="w-5 h-5" />
            </button>

            {/* Download button */}
            {blobUrl && (
              <a
                href={blobUrl}
                download={fileName}
                className="p-2 text-gray-300 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                title="Download"
              >
                <FontAwesomeIcon icon={faDownload} className="w-5 h-5" />
              </a>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-300 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              title="Close (Esc)"
            >
              <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-0 pt-16">
        {!canPreview ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-300 px-6 text-center">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
              <FontAwesomeIcon
                icon={faFileZipper}
                className="w-12 h-12 text-white/70"
              />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium text-white">
                No preview available
              </p>
              <p className="text-sm text-gray-400">
                This file type cannot be previewed in the browser.
              </p>
              {mimeType && mimeType !== 'application/octet-stream' && (
                <p className="text-xs text-gray-500">{mimeType}</p>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent mb-4"></div>
            <p>Loading document...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="w-16 h-16 text-red-400 mb-4"
            />
            <p className="text-red-400 mb-2">Failed to load document</p>
            <p className="text-sm text-gray-400 mb-4">{error}</p>
            <button
              onClick={retry}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <DocumentPreview
            blobUrl={blobUrl}
            mimeType={mimeType}
            fileName={fileName}
          />
        )}
      </div>

      {/* Navigation arrows */}
      {files.length > 1 && !loading && !error && (
        <>
          {/* Previous */}
          {hasPrev && (
            <button
              onClick={onPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all backdrop-blur-sm"
              title="Previous (←)"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="w-6 h-6" />
            </button>
          )}

          {/* Next */}
          {hasNext && (
            <button
              onClick={onNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all backdrop-blur-sm"
              title="Next (→)"
            >
              <FontAwesomeIcon icon={faChevronRight} className="w-6 h-6" />
            </button>
          )}
        </>
      )}

      {/* Rename Modal */}
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        currentName={fileName}
        onRename={handleRename}
        isRenaming={isRenaming}
      />
    </div>
  );
};

export default FilePreviewModal;
