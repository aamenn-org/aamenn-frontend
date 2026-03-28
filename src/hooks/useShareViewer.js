import { useState, useEffect, useCallback } from 'react';
import { shareService } from '../services';
import { importShareKeyRaw } from '../utils/crypto';

/**
 * useShareViewer — Manages all state for a public share link.
 *
 * Responsibilities:
 * - Parse the share key raw bytes from the URL fragment (#k=...)
 * - Import them as an extractable CryptoKey (stable reference, cached by crypto.service)
 * - Fetch root share items from the API
 * - Manage folder navigation stack (breadcrumb-based)
 *
 * The returned `shareKey` CryptoKey is a drop-in replacement for `masterKey`
 * in thumbnailCache and cryptoService.decryptFile — the worker-pool + cache
 * infrastructure is fully generic and handles both identically.
 *
 * @param {string} slug - Share link slug from the URL
 * @returns {{
 *   loading: boolean,
 *   error: string|null,
 *   shareKey: CryptoKey|null,
 *   fileKeys: Record<string, string>,
 *   navStack: Array<{id: string|null, name: string, items: Array}>,
 *   currentLevel: {id: string|null, name: string, items: Array}|null,
 *   previewFile: Object|null,
 *   setPreviewFile: Function,
 *   handleFolderClick: Function,
 *   handleBreadcrumbClick: Function,
 * }}
 */
export function useShareViewer(slug) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareKey, setShareKey] = useState(null);
  const [fileKeys, setFileKeys] = useState({});
  const [navStack, setNavStack] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  const currentLevel = navStack[navStack.length - 1] ?? null;

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

  return {
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
  };
}

export default useShareViewer;
