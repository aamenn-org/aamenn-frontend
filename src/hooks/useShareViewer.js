import { useState, useEffect, useCallback, useMemo } from 'react';
import { shareService } from '../services';
import { importShareKeyRaw } from '../utils/crypto';
import { getFileType, FILE_HANDLERS } from '../utils/thumbnail';

/**
 * useShareViewer — Manages all state for a public share link.
 *
 * Responsibilities:
 * - Parse the share key raw bytes from the URL fragment (#k=...)
 * - Import them as an extractable CryptoKey (stable reference, cached by crypto.service)
 * - Fetch root share items from the API
 * - Manage folder navigation stack (breadcrumb-based)
 * - Split files into photo vs document lists for correct viewer routing
 * - Track preview index for left/right navigation within the correct list
 *
 * The returned `shareKey` CryptoKey is a drop-in replacement for `masterKey`
 * in thumbnailCache and cryptoService.decryptFile — the worker-pool + cache
 * infrastructure is fully generic and handles both identically.
 *
 * @param {string} slug - Share link slug from the URL
 */
export function useShareViewer(slug) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareKey, setShareKey] = useState(null);
  const [fileKeys, setFileKeys] = useState({});
  const [fileNames, setFileNames] = useState({});
  const [navStack, setNavStack] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  // Which viewer list is active: 'photo' or 'document'
  const [previewListType, setPreviewListType] = useState('photo');

  const currentLevel = navStack[navStack.length - 1] ?? null;

  // Split files into photo files (images/videos/other → PhotoViewer)
  // and document files (PDF/DOCX/TXT → FilePreviewModal)
  const { viewerPhotoFiles, viewerDocumentFiles } = useMemo(() => {
    if (!currentLevel) return { viewerPhotoFiles: [], viewerDocumentFiles: [] };
    const files = currentLevel.items.filter((item) => item.type === 'file');
    return {
      viewerPhotoFiles: files.filter(
        (f) => !FILE_HANDLERS[getFileType(f.mimeType)]?.usesPreviewModal,
      ),
      viewerDocumentFiles: files.filter(
        (f) => FILE_HANDLERS[getFileType(f.mimeType)]?.usesPreviewModal,
      ),
    };
  }, [currentLevel]);

  useEffect(() => {
    let cancelled = false;

    async function loadShare() {
      try {
        setLoading(true);
        setError(null);

        const fragment = window.location.hash.substring(1);
        const params = new URLSearchParams(fragment);
        const shareKeyRaw = params.get('k');
        if (!shareKeyRaw) throw new Error('Share key missing from URL');

        // Import the raw share key bytes as an extractable CryptoKey.
        // Must be done ONCE here to produce a stable object reference —
        // crypto.service._getMasterKeyBytes caches by object identity (===).
        const importedKey = await importShareKeyRaw(shareKeyRaw);

        const data = await shareService.resolveShare(slug);

        if (!cancelled) {
          setShareKey(importedKey);
          setFileKeys(data.fileKeys || {});
          setFileNames(data.fileNames || {});
          setNavStack([{ id: null, name: 'Shared', items: data.items || [] }]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load shared content');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadShare();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleFolderClick = useCallback(
    async (folder) => {
      try {
        const data = await shareService.browseShare(slug, folder.folderId);
        setNavStack((prev) => [
          ...prev,
          {
            id: folder.folderId,
            name: folder.decryptedName || 'Folder',
            items: data.items || [],
          },
        ]);
      } catch (err) {
        console.error('[useShareViewer] Failed to open folder:', err);
      }
    },
    [slug],
  );

  const handleBreadcrumbClick = useCallback((index) => {
    setNavStack((prev) => prev.slice(0, index + 1));
  }, []);

  // ── Preview: photo viewer state ──────────────────────────────────────────
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);

  // Open the correct viewer for a file click
  const openPreview = useCallback(
    (file) => {
      const fileType = getFileType(file.mimeType);
      const handler = FILE_HANDLERS[fileType];

      const targetList = handler?.usesPreviewModal
        ? viewerDocumentFiles
        : viewerPhotoFiles;
      const index = targetList.findIndex((f) => f.fileId === file.fileId);

      if (index !== -1) {
        setPreviewIndex(index);
        setPreviewFile(file);
        if (handler?.usesPreviewModal) {
          setPreviewListType('document');
          setDocumentViewerOpen(true);
          setPhotoViewerOpen(false);
        } else {
          setPreviewListType('photo');
          setPhotoViewerOpen(true);
          setDocumentViewerOpen(false);
        }
      }
    },
    [viewerPhotoFiles, viewerDocumentFiles],
  );

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerOpen(false);
    setPreviewFile(null);
  }, []);

  const closeDocumentViewer = useCallback(() => {
    setDocumentViewerOpen(false);
    setPreviewFile(null);
  }, []);

  return {
    loading,
    error,
    slug,
    shareKey,
    fileKeys,
    fileNames,
    navStack,
    currentLevel,
    previewFile,
    previewIndex,
    setPreviewIndex,
    previewListType,
    viewerPhotoFiles,
    viewerDocumentFiles,
    photoViewerOpen,
    documentViewerOpen,
    openPreview,
    closePhotoViewer,
    closeDocumentViewer,
    handleFolderClick,
    handleBreadcrumbClick,
  };
}

export default useShareViewer;
