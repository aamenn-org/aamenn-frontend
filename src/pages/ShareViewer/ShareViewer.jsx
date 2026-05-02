import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { thumbnailCache, shareService } from '../../services';
import { useShareViewer } from '../../hooks/index.js';
import { useAuth } from '../../context';
import { _aesGcmDecrypt, encryptAesGcm } from '../../utils/crypto';
import { isPDF, isDOCX, isTextFile } from '../../utils/thumbnail';
import PhotoViewer from '../../components/gallery/PhotoViewer';
import FilePreviewModal from '../../components/documents/FilePreviewModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faImage,
  faFolder,
  faFile,
  faFilePdf,
  faFileWord,
  faFileLines,
  faFileVideo,
  faChevronRight,
  faHouse,
  faShieldHalved,
  faFloppyDisk,
  faArrowRightToBracket,
  faCheck,
  faSpinner,
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

  // Document-type icons for non-image/video files
  let placeholderIcon = faFile;
  let iconColorClass = 'text-gray-300 dark:text-zinc-600';
  const mime = file.mimeType;
  if (isPDF(mime)) {
    placeholderIcon = faFilePdf;
    iconColorClass = 'text-red-400';
  } else if (isDOCX(mime)) {
    placeholderIcon = faFileWord;
    iconColorClass = 'text-blue-400';
  } else if (isTextFile(mime)) {
    placeholderIcon = faFileLines;
    iconColorClass = 'text-gray-400';
  } else if (mime?.startsWith('video/')) {
    placeholderIcon = faFileVideo;
    iconColorClass = 'text-purple-400';
  } else if (mime?.startsWith('image/')) {
    placeholderIcon = faImage;
    iconColorClass = 'text-green-400';
  } else if (failed) {
    placeholderIcon = faFile;
    iconColorClass = 'text-red-300';
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800">
      <FontAwesomeIcon
        icon={placeholderIcon}
        className={`w-10 h-10 ${iconColorClass}`}
      />
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
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
      {items.map((item) => {
        if (item.type === 'folder') {
          return (
            <button
              key={item.folderId}
              onClick={() => onFolderClick(item)}
              className="aspect-video rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-amber-50 dark:hover:bg-zinc-700 transition-colors flex flex-col items-start justify-end p-2 gap-0.5 text-left"
            >
              <div className="mb-0.5">
                <FolderIcon />
              </div>
              <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate w-full leading-tight">
                {item.decryptedName || 'Folder'}
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.fileId}
            onClick={() => onFileClick(item)}
            className="aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700 hover:ring-2 hover:ring-blue-400 transition-all"
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
  const { isAuthenticated, getMasterKey, masterKeyAvailable } = useAuth();

  const {
    loading,
    error,
    shareKey,
    fileKeys,
    fileNames,
    navStack,
    currentLevel,
    previewIndex,
    setPreviewIndex,
    viewerPhotoFiles,
    viewerDocumentFiles,
    photoViewerOpen,
    documentViewerOpen,
    openPreview,
    closePhotoViewer,
    closeDocumentViewer,
    handleFolderClick,
    handleBreadcrumbClick,
  } = useShareViewer(slug);

  // ── Save to account ──────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null); // null | { success, savedCount }

  const handleSaveToAccount = useCallback(async () => {
    if (!isAuthenticated || !masterKeyAvailable || saving) return;
    const masterKey = getMasterKey();
    if (!masterKey || !shareKey) return;

    // Collect all file items from current level
    const allFiles = currentLevel?.items?.filter((i) => i.type === 'file') || [];
    if (allFiles.length === 0) return;

    setSaving(true);
    setSaveResult(null);
    try {

      const filesToSave = [];
      for (const file of allFiles) {
        const encFileKey = fileKeys[file.fileId];
        if (!encFileKey) continue;

        // Decrypt file key with share key → raw bytes → re-encrypt with master key
        const rawFileKeyBytes = await _aesGcmDecrypt(shareKey, encFileKey);
        const newCipherFileKey = await encryptAesGcm(masterKey, rawFileKeyBytes);

        // Decrypt filename with share key, re-encrypt with master key
        let newFileNameEncrypted = file.fileNameEncrypted; // fallback: keep original
        const shareEncName = fileNames[file.fileId];
        if (shareEncName) {
          try {
            const nameBytes = await _aesGcmDecrypt(shareKey, shareEncName);
            newFileNameEncrypted = await encryptAesGcm(masterKey, nameBytes);
          } catch { /* keep fallback */ }
        }

        filesToSave.push({
          originalFileId: file.fileId,
          cipherFileKey: newCipherFileKey,
          fileNameEncrypted: newFileNameEncrypted,
        });
      }

      if (filesToSave.length > 0) {
        const result = await shareService.saveToAccount(slug, filesToSave);
        setSaveResult(result);
      }
    } catch (err) {
      console.error('[ShareViewer] Save to account failed:', err);
      setSaveResult({ success: false, savedCount: 0 });
    } finally {
      setSaving(false);
    }
  }, [isAuthenticated, masterKeyAvailable, saving, getMasterKey, shareKey, currentLevel, fileKeys, fileNames, slug]);

  // Auto-dismiss save result after 4s
  useEffect(() => {
    if (!saveResult) return;
    const t = setTimeout(() => setSaveResult(null), 4000);
    return () => clearTimeout(t);
  }, [saveResult]);

  // Count files for display
  const totalFiles = currentLevel?.items?.filter((i) => i.type === 'file').length || 0;
  const totalFolders = currentLevel?.items?.filter((i) => i.type === 'folder').length || 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Decrypting shared content…</p>
        </div>
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
    <>
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      {/* Header bar */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <FontAwesomeIcon icon={faShieldHalved} className="w-5 h-5" />
              <span className="font-semibold text-sm hidden sm:inline">Aamenn</span>
            </div>
            <span className="text-gray-300 dark:text-zinc-600">|</span>
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              Shared with you
              {totalFiles > 0 && (
                <span className="text-gray-400 dark:text-gray-500 ml-1">
                  · {totalFiles} file{totalFiles !== 1 ? 's' : ''}
                  {totalFolders > 0 && `, ${totalFolders} folder${totalFolders !== 1 ? 's' : ''}`}
                </span>
              )}
            </span>
          </div>

          {/* Save to account / Login */}
          <div className="flex items-center gap-2">
            {saveResult?.success ? (
              <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5" />
                Saved {saveResult.savedCount} file{saveResult.savedCount !== 1 ? 's' : ''}
              </span>
            ) : isAuthenticated && masterKeyAvailable ? (
              <button
                onClick={handleSaveToAccount}
                disabled={saving || totalFiles === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <FontAwesomeIcon icon={faSpinner} className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FontAwesomeIcon icon={faFloppyDisk} className="w-3.5 h-3.5" />
                )}
                {saving ? 'Saving…' : 'Save to My Account'}
              </button>
            ) : (
              <button
                onClick={() => navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.hash)}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
              >
                <FontAwesomeIcon icon={faArrowRightToBracket} className="w-3.5 h-3.5" />
                Sign in to save
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb navigation */}
        {navStack.length > 0 && (
          <nav className="flex items-center gap-1 mb-5 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
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
            onFileClick={openPreview}
            onFolderClick={handleFolderClick}
          />
        )}

        {/* Footer */}
        <div className="mt-12 mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-zinc-800 px-4 py-2 rounded-full">
            <FontAwesomeIcon icon={faShieldHalved} className="w-3 h-3" />
            End-to-end encrypted · Only people with this link can access it
          </div>
        </div>
      </div>

      {/* Photo/Media Viewer — images, videos, other non-document files */}
      {viewerPhotoFiles.length > 0 && (
        <PhotoViewer
          file={viewerPhotoFiles[previewIndex]}
          files={viewerPhotoFiles}
          isOpen={photoViewerOpen}
          onClose={closePhotoViewer}
          onNext={() =>
            setPreviewIndex((i) =>
              Math.min(i + 1, viewerPhotoFiles.length - 1),
            )
          }
          onPrev={() => setPreviewIndex((i) => Math.max(i - 1, 0))}
          hasNext={previewIndex < viewerPhotoFiles.length - 1}
          hasPrev={previewIndex > 0}
          currentIndex={previewIndex}
          shareKey={shareKey}
          encryptedFileKeys={fileKeys}
          fileNames={fileNames}
        />
      )}

      {/* Document Preview — PDF, DOCX, TXT */}
      {viewerDocumentFiles.length > 0 && (
        <FilePreviewModal
          file={viewerDocumentFiles[previewIndex]}
          files={viewerDocumentFiles}
          isOpen={documentViewerOpen}
          onClose={closeDocumentViewer}
          onNext={() =>
            setPreviewIndex((i) =>
              Math.min(i + 1, viewerDocumentFiles.length - 1),
            )
          }
          onPrev={() => setPreviewIndex((i) => Math.max(i - 1, 0))}
          hasNext={previewIndex < viewerDocumentFiles.length - 1}
          hasPrev={previewIndex > 0}
          currentIndex={previewIndex}
          shareKey={shareKey}
          encryptedFileKeys={fileKeys}
          fileNames={fileNames}
        />
      )}
    </div>

    {/* Toast notification */}
    {saveResult && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
        <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-medium whitespace-nowrap ${
          saveResult.success ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <FontAwesomeIcon icon={saveResult.success ? faCheck : faTriangleExclamation} className="w-4 h-4" />
          {saveResult.success
            ? `Saved ${saveResult.savedCount} file${saveResult.savedCount !== 1 ? 's' : ''} to your account`
            : 'Failed to save. Please try again.'}
        </div>
      </div>
    )}
    </>
  );
};

export default ShareViewer;
