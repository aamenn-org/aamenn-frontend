import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { thumbnailCache, fileService, cryptoService } from '../../services';
import { useShareViewer } from "../../hooks/index.js";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faXmark,
  faDownload,
  faCircleExclamation,
  faImage,
  faFolder,
  faFile,
  faChevronRight,
  faHouse,
} from '@fortawesome/free-solid-svg-icons';

// ─── Thumbnail: uses thumbnailCache (L1 memory → L2 IndexedDB → worker decrypt) ─
/**
 * Renders a decrypted thumbnail for a shared file.
 *
 * Uses the same `thumbnailCache.getThumbnailWithPriority` as the dashboard —
 * the share key CryptoKey is passed as the `masterKey` argument, which the cache
 * and worker treat identically to the user's master key.
 *
 * On second view the blob URL is served instantly from L1 memory (LRU, 3000 items).
 * On page refresh it is served from L2 IndexedDB — no network round-trip.
 */
const SharedFileThumbnail = ({ file, shareKey, encryptedFileKey }) => {
  const [blobUrl, setBlobUrl] = useState(
    // Synchronous L1 check: zero async overhead for already-seen items
    () => thumbnailCache.getSmallThumbnailFromMemory(file.fileId),
  );
  const [decrypting, setDecrypting] = useState(false);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    // Non-image files show a placeholder; thumbnails without a URL are skipped
    if (!file.thumbSmallUrl || !shareKey || !encryptedFileKey) return;
    if (!file.mimeType?.startsWith('image/') && !file.mimeType?.startsWith('video/')) return;

    // Already in L1 — synchronous path already handled by useState initializer
    if (thumbnailCache.getSmallThumbnailFromMemory(file.fileId)) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDecrypting(true);

    thumbnailCache
      .getThumbnailWithPriority(file.fileId, file.thumbSmallUrl, shareKey, encryptedFileKey, {
        priority: 'high',
        signal: controller.signal,
      })
      .then((url) => {
        if (!controller.signal.aborted) {
          setBlobUrl(url);
          setDecrypting(false);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setFailed(true);
        setDecrypting(false);
      });

    return () => controller.abort();
  }, [file.fileId, file.thumbSmallUrl, file.mimeType, shareKey, encryptedFileKey]);

  if (decrypting && !blobUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      </div>
    );
  }
  if (blobUrl) {
    return <img src={blobUrl} alt="" className="w-full h-full object-cover" />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800">
      <FontAwesomeIcon
        icon={failed ? faFile : faImage}
        className="w-10 h-10 text-gray-300 dark:text-zinc-600"
      />
    </div>
  );
};

// ─── Full-screen preview: uses thumbnailCache.getMediumThumbnail (cached) ────────────
/**
 * Full-screen overlay that decrypts and displays a single shared file.
 *
 * Uses `thumbnailCache.getMediumThumbnail` — same infrastructure as the dashboard viewer.
 * Second open of the same file is instant from L1 memory; refresh uses L2 IndexedDB.
 */
const FilePreviewOverlay = ({ file, shareKey, encryptedFileKey, onClose }) => {
  const [blobUrl, setBlobUrl] = useState(
    () => thumbnailCache.getMediumFromMemory(file.fileId),
  );
  const [decrypting, setDecrypting] = useState(
    !thumbnailCache.getMediumFromMemory(file.fileId),
  );
  const [decryptError, setDecryptError] = useState(null);

  useEffect(() => {
    if (!encryptedFileKey || !shareKey || !file.thumbMediumUrl) return;

    // Already in L1 memory — nothing to do
    if (thumbnailCache.getMediumFromMemory(file.fileId)) return;

    thumbnailCache
      .getMediumThumbnail(
        file.fileId,
        file.thumbMediumUrl,
        shareKey,
        encryptedFileKey,
      )
      .then((url) => {
        setBlobUrl(url);
        setDecrypting(false);
      })
      .catch((err) => {
        setDecryptError(err);
        setDecrypting(false);
      });
  }, [file.fileId, file.thumbMediumUrl, shareKey, encryptedFileKey]);

  const handleDownload = async () => {
    if (!file.downloadUrl || !shareKey || !encryptedFileKey) return;
    
    try {
      // Download original encrypted file directly from B2 (no cache)
      const encryptedData = await fileService.downloadFileContent(file.downloadUrl);
      
      // Decrypt to get the original file
      const decryptedData = await cryptoService.decryptFile(
        encryptedData,
        encryptedFileKey,
        shareKey
      );
      
      // Create blob from original decrypted data
      const blob = new Blob([decryptedData], { type: file.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      // Use extension that matches the original MIME type
      const extension = file.mimeType?.split('/')[1] || 'bin';
      link.download = `shared-file.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Shared file download failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
      >
        <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
      </button>
      <button
        onClick={handleDownload}
        disabled={decrypting || !blobUrl}
        className="absolute top-4 left-4 z-10 px-4 py-2 bg-black/50 backdrop-blur-sm text-white rounded-lg hover:bg-black/70 transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
        {decrypting ? 'Decrypting…' : 'Download'}
      </button>

      {decrypting ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white">Decrypting…</p>
        </div>
      ) : decryptError ? (
        <div className="text-center text-white">
          <FontAwesomeIcon icon={faCircleExclamation} className="w-8 h-8 text-red-400 mb-4" />
          <p>Failed to decrypt file</p>
        </div>
      ) : blobUrl && file.mimeType?.startsWith('image/') ? (
        <img src={blobUrl} alt="Shared file" className="max-w-full max-h-full object-contain" />
      ) : blobUrl && file.mimeType?.startsWith('video/') ? (
        <video src={blobUrl} controls className="max-w-full max-h-full" />
      ) : blobUrl ? (
        <div className="text-center text-white">
          <FontAwesomeIcon icon={faFile} className="w-16 h-16 text-gray-400 mb-4" />
          <p className="text-lg">File ready</p>
          <p className="text-sm text-gray-400 mt-1">{file.mimeType}</p>
        </div>
      ) : null}
    </div>
  );
};

// ─── Folder card ───────────────────────────────────────────────────────────────
const FolderIcon = () => (
  <svg viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-8">
    <rect x="2" y="0" width="14" height="7" rx="3" fill="#EF9F27" opacity="0.85" />
    <rect x="2" y="5" width="40" height="29" rx="4" fill="#EF9F27" />
  </svg>
);

// ─── Unified grid: files + folders ────────────────────────────────────────────
const SharedGrid = ({ items, shareKey, fileKeys, onFileClick, onFolderClick }) => {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <FontAwesomeIcon icon={faFolder} className="w-12 h-12 text-gray-300 mb-4" />
        <p>This share is empty</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {items.map((item) => {
        if (item.type === 'folder') {
          return (
            <button
              key={item.folderId}
              onClick={() => onFolderClick(item)}
              className="aspect-square rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-amber-50 dark:hover:bg-zinc-700 transition-colors flex flex-col items-start justify-end p-3 gap-1 text-left"
            >
              <div className="mb-1">
                <FolderIcon />
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate w-full">
                {item.decryptedName || 'Folder'}
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.fileId}
            onClick={() => onFileClick(item)}
            className="aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 hover:ring-2 hover:ring-blue-400 transition-all"
          >
            <SharedFileThumbnail
              file={item}
              shareKey={shareKey}
              encryptedFileKey={fileKeys[item.fileId]}
            />
          </button>
        );
      })}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
const ShareViewer = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  const {
    loading,
    error,
    shareKey,
    fileKeys,
    navStack,
    currentLevel,
    previewFile,
    setPreviewFile,
    handleFolderClick,
    handleBreadcrumbClick,
  } = useShareViewer(slug);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="max-w-md w-full bg-white dark:bg-zinc-800 rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Share Not Found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Breadcrumb navigation */}
        {navStack.length > 0 && (
          <nav className="flex items-center gap-1 mb-6 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
            {navStack.map((level, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && (
                  <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3 text-gray-400" />
                )}
                {index === 0 ? (
                  <button
                    onClick={() => handleBreadcrumbClick(0)}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />
                    <span>{level.name}</span>
                  </button>
                ) : index === navStack.length - 1 ? (
                  <span className="font-medium text-gray-800 dark:text-gray-200">{level.name}</span>
                ) : (
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    {level.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}

        {/* Shared grid */}
        {currentLevel && shareKey && (
          <SharedGrid
            items={currentLevel.items}
            shareKey={shareKey}
            fileKeys={fileKeys}
            onFileClick={setPreviewFile}
            onFolderClick={handleFolderClick}
          />
        )}

        {/* Footer */}
        <p className="mt-10 text-center text-xs text-gray-400 dark:text-gray-600">
          End-to-end encrypted. Only people with this link can access it.
        </p>
      </div>

      {/* Full-screen file preview — rendered only when shareKey is ready */}
      {previewFile && shareKey && (
        <FilePreviewOverlay
          file={previewFile}
          shareKey={shareKey}
          encryptedFileKey={fileKeys[previewFile.fileId]}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
};

export default ShareViewer;
