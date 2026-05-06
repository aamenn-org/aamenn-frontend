import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { fileService, cryptoService } from '../../services';
import { useAuth } from '../../context';
import { thumbnailCache } from '../../services/cache/thumbnail-cache';
import {
  isVideo,
  isSvg,
  getFileType,
  FILE_TYPES,
  formatVideoDuration,
} from '../../utils/thumbnail';
import { decryptFilename, encryptFilename } from '../../utils/crypto';
import RenameModal from './RenameModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faMagnifyingGlassPlus,
  faMagnifyingGlassMinus,
  faInfoCircle,
  faEllipsisVertical,
  faDownload,
  faShare,
  faTrash,
  faPen,
  faXmark,
  faChevronLeft,
  faChevronRight,
  faPlus,
  faVideo,
  faFileCircleQuestion,
} from '@fortawesome/free-solid-svg-icons';

/**
 * MediaViewer (PhotoViewer) with INSTANT loading like Ente.io:
 * 1. Instantly show best available cached image/video (full > medium > small thumbnail)
 * 2. Upgrade to higher quality in background
 * 3. NEVER show loading spinner if ANY cached version exists
 * 4. Preload adjacent items
 * 5. Full-screen immersive experience with auto-hiding controls
 * 6. Video support with modern minimal controls
 */

// Auto-hide delay in milliseconds
const AUTO_HIDE_DELAY = 3000;

const PhotoViewer = ({
  file,
  files = [], // All files for preloading adjacent
  isOpen,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentIndex,
  onAddToAlbum,
  onDelete,
  onShare,
  // Share mode props (optional) — when provided, viewer operates read-only
  // using the share key instead of the user's master key.
  shareKey = null,
  encryptedFileKeys = null,
  fileNames = null,
}) => {
  const { getMasterKey } = useAuth();
  const { t } = useTranslation(['photos', 'common']);

  // Share mode: read-only viewer for public share pages
  const isShareMode = !!shareKey;
  const getKey = useCallback(() => isShareMode ? shareKey : getMasterKey(), [isShareMode, shareKey, getMasterKey]);

  // Determine if this is a video file
  const isVideoFile = isVideo(file?.mimeType);
  const isSvgFile = isSvg(file?.mimeType);
  const isOtherFile = getFileType(file?.mimeType) === FILE_TYPES.OTHER;

  // Image/Video URLs - progressive quality
  const [displayUrl, setDisplayUrl] = useState(null);
  const [quality, setQuality] = useState('none'); // none | small | medium | large
  // qualityRef mirrors quality state so loadImage can read current quality
  // without being in its useCallback dep array (avoids infinite re-render loop)
  const qualityRef = useRef('none');
  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null); // null | 0–100
  const [downloadStage, setDownloadStage] = useState('idle'); // 'idle' | 'downloading' | 'decrypting'
  const [zoomScale, setZoomScale] = useState(1);

  const containerRef = useRef(null);

  // UI visibility states for auto-hide behavior
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [showBottomOverlay, setShowBottomOverlay] = useState(false);
  const [showCloseButton, setShowCloseButton] = useState(true);

  // Menu and info panel states
  const [showMenu, setShowMenu] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const menuRef = useRef(null);

  // Decrypted filename
  const [decryptedFileName, setDecryptedFileName] = useState(null);
  useEffect(() => {
    const decrypt = async () => {
      const key = getKey();
      // In share mode, use fileNames[fileId] (re-encrypted with share key)
      // instead of file.fileNameEncrypted (encrypted with master key)
      const encName = isShareMode
        ? (fileNames?.[file?.fileId] || null)
        : file?.fileNameEncrypted;
      if (!encName || !key) {
        setDecryptedFileName(null);
        return;
      }
      try {
        const name = await decryptFilename(encName, key);
        setDecryptedFileName(name);
      } catch (err) {
        console.warn('[PhotoViewer] Failed to decrypt filename:', err);
        setDecryptedFileName(null);
      }
    };
    decrypt();
  }, [file?.fileId, file?.fileNameEncrypted, getKey, isShareMode, fileNames]);

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  // Handle rename
  const handleRename = async (newName) => {
    if (!file?.fileId || !getMasterKey()) return;

    setIsRenaming(true);
    try {
      const masterKey = getMasterKey();
      const encryptedName = await encryptFilename(newName, masterKey);

      await fileService.updateFile(file.fileId, {
        fileNameEncrypted: encryptedName,
      });

      // Update local state
      setDecryptedFileName(newName);

      // Update file object if there's a callback
      if (file) {
        file.fileNameEncrypted = encryptedName;
      }
    } catch (err) {
      console.error('[PhotoViewer] Failed to rename file:', err);
      throw err;
    } finally {
      setIsRenaming(false);
    }
  };

  // Timers for auto-hide
  const leftArrowTimerRef = useRef(null);
  const rightArrowTimerRef = useRef(null);
  const bottomOverlayTimerRef = useRef(null);
  const closeButtonTimerRef = useRef(null);

  const clearAutoHideTimer = useCallback((timerRef) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startAutoHideTimer = useCallback(
    (timerRef, setVisible) => {
      clearAutoHideTimer(timerRef);
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, AUTO_HIDE_DELAY);
    },
    [clearAutoHideTimer],
  );

  const handleMouseMove = useCallback(
    (e) => {
      const { clientY, currentTarget } = e;
      const { height } = currentTarget.getBoundingClientRect();
      const bottomZone = height * 0.75;

      setShowCloseButton(true);
      clearAutoHideTimer(closeButtonTimerRef);
      startAutoHideTimer(closeButtonTimerRef, setShowCloseButton);

      setShowLeftArrow(hasPrev);
      clearAutoHideTimer(leftArrowTimerRef);
      startAutoHideTimer(leftArrowTimerRef, setShowLeftArrow);

      setShowRightArrow(hasNext);
      clearAutoHideTimer(rightArrowTimerRef);
      startAutoHideTimer(rightArrowTimerRef, setShowRightArrow);

      if (clientY > bottomZone) {
        setShowBottomOverlay(true);
        clearAutoHideTimer(bottomOverlayTimerRef);
        startAutoHideTimer(bottomOverlayTimerRef, setShowBottomOverlay);
      }
    },
    [hasPrev, hasNext, clearAutoHideTimer, startAutoHideTimer],
  );

  const handleMouseLeave = useCallback(() => {
    startAutoHideTimer(leftArrowTimerRef, setShowLeftArrow);
    startAutoHideTimer(rightArrowTimerRef, setShowRightArrow);
    startAutoHideTimer(bottomOverlayTimerRef, setShowBottomOverlay);
    startAutoHideTimer(closeButtonTimerRef, setShowCloseButton);
  }, [startAutoHideTimer]);

  const handleDeleteFile = useCallback(() => {
    setShowMenu(false);
    onDelete?.(file);
  }, [onDelete, file]);

  // Track current file to prevent stale updates
  const currentFileIdRef = useRef(null);
  const fileDataRef = useRef(null);

  // Get best cached for VIEWER ONLY (excludes small grid thumbnails)
  // This ensures preview never shows small, only medium->large upgrade
  const getBestCachedUrlForViewer = useCallback((fileId) => {
    // Check L1 memory: large > medium only (skip small)
    const largeUrl = thumbnailCache.getLargeThumbnailFromMemory(fileId);
    if (largeUrl) return { url: largeUrl, quality: 'large' };

    const mediumUrl = thumbnailCache.getMediumFromMemory(fileId);
    if (mediumUrl) return { url: mediumUrl, quality: 'medium' };

    // Return null if only small is available
    return { url: null, quality: 'none' };
  }, []);

  // Load and upgrade image quality
  const loadImage = useCallback(
    async (targetFile, fileId) => {
      const key = getKey();
      if (!key) {
        setError('Unable to decrypt. Please log out and log in again.');
        return;
      }

      try {
        // Step 1: Get file metadata
        // In share mode, the file object already carries all data (downloadUrl, thumbs, etc.)
        // so we skip the authenticated fileService.getFile() call.
        let fileData;
        if (isShareMode) {
          const fileKey = encryptedFileKeys?.[fileId] || targetFile.cipherFileKey;
          fileData = { ...targetFile, cipherFileKey: fileKey };
        } else {
          fileData = await fileService.getFile(fileId);
        }
        fileDataRef.current = fileData;

        // Check if we're still viewing the same file
        if (currentFileIdRef.current !== fileId) return;

        const isSvgMime = isSvg(fileData.mimeType);

        if (isSvgMime) {
          // SVG: skip JPEG thumbnail paths entirely — fetch and decrypt the original
          console.log(
            `[PhotoViewer] SVG loadImage: mimeType=${fileData.mimeType} downloadUrl=${!!fileData.downloadUrl} cipherFileKey=${!!fileData.cipherFileKey}`,
          );
          if (fileData.downloadUrl) {
            const svgUrl = await thumbnailCache.getFullImage(
              fileId,
              fileData.downloadUrl,
              key,
              fileData.cipherFileKey,
              'image/svg+xml',
            );
            console.log(
              `[PhotoViewer] SVG getFullImage result: ${svgUrl ? 'OK blob URL' : 'NULL'}`,
            );
            if (currentFileIdRef.current === fileId) {
              setDisplayUrl(svgUrl);
              setQuality('large');
            }
          } else {
            console.warn(
              `[PhotoViewer] SVG has no downloadUrl — cannot preview: ${fileId}`,
            );
          }
        } else {
          // Step 2: Load medium thumbnail (if not already at medium/large quality)
          const currentQuality = qualityRef.current;
          if (
            currentQuality !== 'medium' &&
            currentQuality !== 'large' &&
            fileData.thumbMediumUrl
          ) {
            try {
              const mediumUrl = await thumbnailCache.getMediumThumbnail(
                fileId,
                fileData.thumbMediumUrl,
                key,
                fileData.cipherFileKey,
              );
              if (
                currentFileIdRef.current === fileId &&
                qualityRef.current !== 'large'
              ) {
                setDisplayUrl(mediumUrl);
                setQuality('medium');

                const img = new Image();
                img.src = mediumUrl;
                img.decode().catch(() => {});
              }
            } catch (err) {
              console.warn('Failed to load medium:', err);
            }
          }

          // Step 3: Load large thumbnail (preferred for viewer)
          // Fallback to original if large thumbnail not available (older files)
          if (fileData.thumbLargeUrl) {
            const largeUrl = await thumbnailCache.getLargeThumbnail(
              fileId,
              fileData.thumbLargeUrl,
              key,
              fileData.cipherFileKey,
            );
            if (currentFileIdRef.current === fileId) {
              setDisplayUrl(largeUrl);
              setQuality('large');

              const img = new Image();
              img.src = largeUrl;
              img.decode().catch(() => {});
            }
          } else if (fileData.downloadUrl) {
            const fullUrl = await thumbnailCache.getFullImage(
              fileId,
              fileData.downloadUrl,
              key,
              fileData.cipherFileKey,
              fileData.mimeType,
            );
            if (currentFileIdRef.current === fileId) {
              setDisplayUrl(fullUrl);
              setQuality('large');
            }
          }
        }
      } catch (err) {
        console.error('Failed to load image:', err);
        if (currentFileIdRef.current === fileId) {
          setError(err.message || 'Failed to load image');
        }
      }
    },
    [getKey, isShareMode, encryptedFileKeys],
  );

  // Track preloaded file IDs to avoid re-requesting (persists across renders)
  const preloadedFileIdsRef = useRef(new Set());

  // Zone-based preloading: Track the boundaries of already-preloaded zones
  // Only trigger new preload when user reaches near the boundary
  const preloadZoneRef = useRef({ left: -1, right: -1 });

  // Full image preload zone (smaller, ±2 images)
  const fullPreloadZoneRef = useRef({ left: -1, right: -1 });

  // Configuration for zone-based preloading
  const PRELOAD_ZONE_SIZE = 10; // How many MEDIUM images to preload in each direction
  const PRELOAD_THRESHOLD = 3; // Trigger new preload when this close to boundary
  const FULL_PRELOAD_SIZE = 2; // How many FULL images to preload in each direction

  // Reset zone when viewer closes (so next open starts fresh)
  useEffect(() => {
    if (!isOpen) {
      preloadZoneRef.current = { left: -1, right: -1 };
      fullPreloadZoneRef.current = { left: -1, right: -1 };
    }
  }, [isOpen]);

  // Preload FULL images for ±2 adjacent (likely next clicks)
  const preloadFullAdjacent = useCallback(async () => {
    const key = getKey();
    if (!key || !files.length || currentIndex === undefined) return;

    const zone = fullPreloadZoneRef.current;

    // Check if current index is outside the full preload zone
    const needsPreload =
      zone.left === -1 || currentIndex < zone.left || currentIndex > zone.right;

    if (!needsPreload) return;

    // Calculate new zone centered on current
    const newLeft = Math.max(0, currentIndex - FULL_PRELOAD_SIZE);
    const newRight = Math.min(
      files.length - 1,
      currentIndex + FULL_PRELOAD_SIZE,
    );

    // Collect file IDs that need full preload — skip videos and unsupported types
    const adjacentFileIds = [];
    const adjacentFiles = [];
    for (let i = newLeft; i <= newRight; i++) {
      const f = files[i];
      const fileId = f?.fileId || f?.id;
      if (!fileId) continue;
      // Never eagerly fetch videos or OTHER-type files: they have no preview
      // and can be very large. They are only fetched on explicit download click.
      if (isVideo(f?.mimeType) || getFileType(f?.mimeType) === FILE_TYPES.OTHER) continue;
      if (!thumbnailCache.getFullImageFromMemory(fileId)) {
        adjacentFileIds.push(fileId);
        adjacentFiles.push(f);
      }
    }

    // Update zone
    fullPreloadZoneRef.current = { left: newLeft, right: newRight };

    if (adjacentFileIds.length === 0) return;

    console.log(
      `[PhotoViewer] Preloading ${adjacentFileIds.length} FULL images around index ${currentIndex}`,
    );

    try {
      // In share mode, file metadata is already available from props
      let filesMetadata;
      if (isShareMode) {
        filesMetadata = adjacentFiles.map((f) => ({
          fileId: f.fileId,
          downloadUrl: f.downloadUrl,
          mimeType: f.mimeType,
          cipherFileKey: encryptedFileKeys?.[f.fileId] || f.cipherFileKey,
        }));
      } else {
        const batch = await fileService.getFilesBatch(adjacentFileIds);
        filesMetadata = (batch.files || []).map((f) => ({
          fileId: f.fileId,
          downloadUrl: f.downloadUrl,
          mimeType: f.mimeType,
          cipherFileKey: f.cipherFileKey,
        }));
      }
      if (filesMetadata.length > 0) {
        await thumbnailCache.batchPreloadFull(filesMetadata, key);
      }
    } catch (error) {
      console.warn('[PhotoViewer] Full preload failed:', error);
    }
  }, [getKey, isShareMode, encryptedFileKeys, files, currentIndex]);

  // Preload MEDIUM images for ±10 zone (instant display when navigating)
  const preloadMediumAdjacent = useCallback(async () => {
    const key = getKey();
    if (!key || !files.length || currentIndex === undefined) return;

    const zone = preloadZoneRef.current;

    // Check if we need to preload (first time or approaching boundary)
    const isFirstLoad = zone.left === -1 && zone.right === -1;
    const approachingLeftBoundary =
      currentIndex <= zone.left + PRELOAD_THRESHOLD;
    const approachingRightBoundary =
      currentIndex >= zone.right - PRELOAD_THRESHOLD;

    // If we're comfortably within the preloaded zone, skip
    if (!isFirstLoad && !approachingLeftBoundary && !approachingRightBoundary) {
      console.log(
        `[PhotoViewer] Within zone [${zone.left}-${zone.right}], index=${currentIndex}, skipping preload`,
      );
      return;
    }

    // Determine which direction to extend the zone
    let newLeft = zone.left;
    let newRight = zone.right;
    const adjacentFileIds = [];
    const adjacentFiles = [];

    if (isFirstLoad) {
      // First load: preload ±PRELOAD_ZONE_SIZE around current position
      newLeft = Math.max(0, currentIndex - PRELOAD_ZONE_SIZE);
      newRight = Math.min(files.length - 1, currentIndex + PRELOAD_ZONE_SIZE);
      console.log(`[PhotoViewer] Initial zone load: [${newLeft}-${newRight}]`);
    } else if (approachingLeftBoundary && zone.left > 0) {
      // Extend zone to the left
      newLeft = Math.max(0, zone.left - PRELOAD_ZONE_SIZE);
      console.log(
        `[PhotoViewer] Extending zone LEFT: [${newLeft}-${zone.right}]`,
      );
    } else if (approachingRightBoundary && zone.right < files.length - 1) {
      // Extend zone to the right
      newRight = Math.min(files.length - 1, zone.right + PRELOAD_ZONE_SIZE);
      console.log(
        `[PhotoViewer] Extending zone RIGHT: [${zone.left}-${newRight}]`,
      );
    } else {
      // Already at edge of gallery, nothing to preload
      console.log(`[PhotoViewer] At gallery edge, no extension needed`);
      return;
    }

    // Collect file IDs for the NEW portion of the zone (not already preloaded)
    for (let i = newLeft; i <= newRight; i++) {
      // Skip indices that were already in the previous zone
      if (!isFirstLoad && i >= zone.left && i <= zone.right) continue;

      const f = files[i];
      const fileId = f?.fileId || f?.id;
      if (!fileId) continue;
      // Skip videos and unsupported types — they have no thumbnails to preload
      if (isVideo(f?.mimeType) || getFileType(f?.mimeType) === FILE_TYPES.OTHER) continue;
      // Skip if already preloaded OR has medium thumbnail in memory
      if (
        !preloadedFileIdsRef.current.has(fileId) &&
        !thumbnailCache.getMediumFromMemory(fileId)
      ) {
        adjacentFileIds.push(fileId);
        adjacentFiles.push(f);
      }
    }

    // Update zone boundaries
    preloadZoneRef.current = {
      left: isFirstLoad ? newLeft : Math.min(zone.left, newLeft),
      right: isFirstLoad ? newRight : Math.max(zone.right, newRight),
    };

    if (adjacentFileIds.length === 0) {
      console.log(
        '[PhotoViewer] All files in new zone already preloaded/cached',
      );
      return;
    }

    // Mark these as preloaded BEFORE making the request to prevent race conditions
    adjacentFileIds.forEach((id) => preloadedFileIdsRef.current.add(id));

    console.log(
      `[PhotoViewer] Batch preloading ${adjacentFileIds.length} adjacent files`,
    );

    try {
      // In share mode, file metadata is already available from props
      let filesMetadata;
      if (isShareMode) {
        filesMetadata = adjacentFiles.map((f) => ({
          fileId: f.fileId,
          downloadUrl: f.downloadUrl,
          thumbMediumUrl: f.thumbMediumUrl,
          mimeType: f.mimeType,
          cipherFileKey: encryptedFileKeys?.[f.fileId] || f.cipherFileKey,
        }));
      } else {
        // Batch fetch metadata for all adjacent files in ONE request
        const batch = await fileService.getFilesBatch(adjacentFileIds);
        filesMetadata = (batch.files || []).map((f) => ({
          fileId: f.fileId,
          downloadUrl: f.downloadUrl,
          thumbMediumUrl: f.thumbMediumUrl,
          mimeType: f.mimeType,
          cipherFileKey: f.cipherFileKey,
        }));
      }

      if (filesMetadata.length > 0) {
        // Batch preload all images with controlled concurrency
        await thumbnailCache.batchPreload(filesMetadata, key);
      }
    } catch (error) {
      console.warn('[PhotoViewer] Batch preload failed:', error);
    }
  }, [getKey, isShareMode, encryptedFileKeys, files, currentIndex]);

  // Main effect: Handle file changes INSTANTLY
  useEffect(() => {
    if (!isOpen || !file) return;

    const fileId = file.fileId;
    if (!fileId) return;

    // Track current file
    currentFileIdRef.current = fileId;
    setError(null);

    if (isVideoFile || isOtherFile) {
      // Videos / unknown types: no preview
      setDisplayUrl(null);
      setQuality('none');
      console.log(`[PhotoViewer] No-preview file type: ${fileId}`);
    } else if (isSvgFile) {
      // SVGs: skip L1 thumbnail cache (no JPEG thumbnails exist for SVG).
      // Do NOT call setQuality/setDisplayUrl before loadImage — that would change
      // `quality` state, which is a dep of `loadImage` useCallback, triggering
      // an infinite re-render loop.
      console.log(
        `[PhotoViewer] SVG file detected — loading via downloadUrl path: ${fileId}`,
      );
      loadImage(file, fileId);
    } else {
      // INSTANT: Check memory cache for VIEWER (medium/large only, skip small)
      const cached = getBestCachedUrlForViewer(fileId);
      if (cached.url) {
        setDisplayUrl(cached.url);
        setQuality(cached.quality);
      } else {
        setDisplayUrl(null);
        setQuality('none');
      }

      // Start loading better quality in background
      loadImage(file, fileId);
    }

    // Preload adjacent images aggressively for instant navigation
    // Medium first (faster, good enough for preview), then full
    const mediumPreloadTimer = setTimeout(preloadMediumAdjacent, 50);
    const fullPreloadTimer = setTimeout(preloadFullAdjacent, 200);

    return () => {
      clearTimeout(fullPreloadTimer);
      clearTimeout(mediumPreloadTimer);
    };
  }, [
    file?.fileId,
    file?.id,
    file?.mimeType,
    isOpen,
    getBestCachedUrlForViewer,
    loadImage,
    preloadFullAdjacent,
    preloadMediumAdjacent,
  ]);

  /**
   * Unified download handler for all file types (image, video, zip, etc.).
   *
   * Download flow:
   *  1. Always fetches a fresh signed URL from the backend (avoids expired cached URLs).
   *  2. Streams the encrypted bytes from B2 while reporting byte-level progress (0–100 %).
   *  3. Decrypts the full buffer with AES-GCM (authenticated encryption requires the
   *     complete ciphertext, so streaming decryption is not possible).
   *  4. Triggers a browser download via a short-lived Blob URL.
   *
   * No network traffic is generated until the user explicitly clicks the button.
   */
  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadStage('downloading');
    try {
      const key = getKey();
      if (!key) {
        console.error('Download failed: no key');
        return;
      }

      // In share mode, use inline file data; otherwise fetch fresh signed URL.
      let fileData;
      if (isShareMode) {
        const fileKey = encryptedFileKeys?.[file.fileId] || file.cipherFileKey;
        fileData = { ...file, cipherFileKey: fileKey };
      } else {
        fileData = await fileService.getFile(file.fileId, { skipCache: true });
      }

      // Stream encrypted bytes from B2 with progress tracking.
      const encryptedData = await fileService.downloadFileContentWithProgress(
        fileData.downloadUrl,
        setDownloadProgress,
      );

      // AES-GCM decryption (full buffer required).
      setDownloadStage('decrypting');
      const decryptedData = await cryptoService.decryptFile(
        encryptedData,
        fileData.cipherFileKey,
        key,
      );

      // Trigger browser save dialog via a short-lived Blob URL.
      const mimeType = fileData.mimeType || 'application/octet-stream';
      const blob = new Blob([decryptedData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = decryptedFileName || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Delay revoke so the browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
      setDownloadStage('idle');
    }
  }, [downloading, getKey, isShareMode, encryptedFileKeys, file, decryptedFileName]);

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDateFull = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getMegapixels = (width, height) => {
    if (!width || !height) return null;
    const mp = (width * height) / 1000000;
    return mp >= 1 ? `${mp.toFixed(1)}MP` : `${(mp * 1000).toFixed(0)}K`;
  };

  const getCategory = (mimeType) => {
    if (!mimeType) return null;
    if (mimeType.startsWith('image/')) return 'Photo';
    if (mimeType.startsWith('video/')) return 'Video';
    return null;
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      setShowLeftArrow(hasPrev);
      setShowRightArrow(hasNext);
      setShowBottomOverlay(true);
      setShowCloseButton(true);

      startAutoHideTimer(leftArrowTimerRef, setShowLeftArrow);
      startAutoHideTimer(rightArrowTimerRef, setShowRightArrow);
      startAutoHideTimer(bottomOverlayTimerRef, setShowBottomOverlay);
      startAutoHideTimer(closeButtonTimerRef, setShowCloseButton);

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (hasPrev) onPrev();
          break;
        case 'ArrowRight':
          if (hasNext) onNext();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onNext, onPrev, hasNext, hasPrev, startAutoHideTimer]);

  if (!isOpen) return null;

  const isLoading = !displayUrl;
  const isFullQuality = quality === 'large';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Full-screen media container */}
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ direction: 'ltr' }}
      >
        {/* Error State */}
        {error && !displayUrl ? (
          <div className="flex flex-col items-center justify-center text-gray-400">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="w-16 h-16 mb-4"
            />
            <p>{error}</p>
          </div>
        ) : isVideoFile ? (
          /* Video — preview not supported */
          <div className="flex flex-col items-center justify-center gap-5 text-gray-300 px-6 text-center">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
              <FontAwesomeIcon
                icon={faVideo}
                className="w-12 h-12 text-white/70"
              />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium text-white">
                Video preview is not supported
              </p>
              <p className="text-sm text-gray-400">
                You can download this video to watch it.
              </p>
            </div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex flex-col items-center gap-1.5 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 min-w-[160px]"
            >
              <span className="flex items-center gap-2">
                {downloading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                )}
                {downloadStage === 'decrypting'
                  ? 'Decrypting…'
                  : downloadStage === 'downloading'
                    ? `Downloading ${downloadProgress ?? 0}%`
                    : 'Download Video'}
              </span>
              {downloadStage === 'downloading' && (
                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-200"
                    style={{ width: `${downloadProgress ?? 0}%` }}
                  />
                </div>
              )}
            </button>
          </div>
        ) : isOtherFile ? (
          /* Unknown file type — no preview */
          <div className="flex flex-col items-center justify-center gap-5 text-gray-300 px-6 text-center">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
              <FontAwesomeIcon
                icon={faFileCircleQuestion}
                className="w-12 h-12 text-white/70"
              />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium text-white">
                No preview available
              </p>
              {decryptedFileName && (
                <p className="text-sm text-white/80 font-medium">
                  {decryptedFileName}
                </p>
              )}
              {file?.mimeType && (
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  {file.mimeType}
                </p>
              )}
            </div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex flex-col items-center gap-1.5 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 min-w-[160px]"
            >
              <span className="flex items-center gap-2">
                {downloading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                )}
                {downloadStage === 'decrypting'
                  ? 'Decrypting…'
                  : downloadStage === 'downloading'
                    ? `Downloading ${downloadProgress ?? 0}%`
                    : 'Download File'}
              </span>
              {downloadStage === 'downloading' && (
                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-200"
                    style={{ width: `${downloadProgress ?? 0}%` }}
                  />
                </div>
              )}
            </button>
          </div>
        ) : (
          /* Image Display */
          <>
            {/* Empty placeholder */}
            {isLoading && (
              <div className="flex items-center justify-center w-full h-full">
                {/* Just wait for image - black background */}
              </div>
            )}

            {/* Actual image - full screen with zoom/pan support */}
            {displayUrl && (
              <TransformWrapper
                initialScale={1}
                minScale={1}
                maxScale={4}
                centerOnInit={true}
                onTransformed={(ref, state) => {
                  setZoomScale(state.scale);
                }}
                wheel={{
                  step: 0.01,
                  smoothStep: 0.02,
                }}
                doubleClick={{ mode: 'reset' }}
                panning={{
                  disabled: false,
                }}
                velocityAnimation={{
                  sensitivity: 0.002,
                  animationTime: 200,
                }}
              >
                {({ zoomIn, zoomOut, resetTransform, state }) => (
                  <>
                    {/* Zoom Controls - unified design with percentage and hover activation */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 group">
                      <div
                        className={`flex items-center gap-1 px-2 py-1.5 bg-black/60 rounded-full transition-opacity duration-300 ${
                          showCloseButton ? 'opacity-100' : 'opacity-0'
                        } group-hover:opacity-100`}
                      >
                        <button
                          onClick={() => zoomIn()}
                          className="p-1.5 hover:bg-white/20 rounded-full text-white transition-colors"
                          title="Zoom In"
                        >
                          <FontAwesomeIcon
                            icon={faMagnifyingGlassPlus}
                            className="w-4 h-4"
                          />
                        </button>
                        <span className="px-2 text-white text-sm font-medium min-w-[3rem] text-center">
                          {Math.round(zoomScale * 100)}%
                        </span>
                        <button
                          onClick={() => zoomOut()}
                          className="p-1.5 hover:bg-white/20 rounded-full text-white transition-colors"
                          title="Zoom Out"
                        >
                          <FontAwesomeIcon
                            icon={faMagnifyingGlassMinus}
                            className="w-4 h-4"
                          />
                        </button>
                      </div>
                    </div>

                    <TransformComponent
                      wrapperClass="!w-full !h-full !overflow-hidden"
                      contentClass="flex items-center justify-center"
                      contentStyle={{ direction: 'ltr' }}
                      wrapperStyle={{
                        width: '100%',
                        height: '100%',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={displayUrl}
                        alt="Photo"
                        style={{
                          maxWidth: '100vw',
                          maxHeight: '100vh',
                          width: 'auto',
                          height: 'auto',
                          // RTL fix: Ensure proper positioning in RTL mode
                          margin: '0 auto',
                          display: 'block',
                          // Smooth transition when upgrading medium->large (same dimensions)
                          transition: 'opacity 0.2s ease-in-out',
                        }}
                        draggable={false}
                        // Performance: decode image async for instant rendering
                        decoding="async"
                        // Performance: hint browser this is high priority
                        fetchPriority="high"
                      />
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            )}
          </>
        )}
      </div>

      {/* Close button - top right overlay */}
      <div
        className={`absolute top-4 right-4 z-20 flex items-center space-x-2 transition-all duration-300 ${
          showCloseButton ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Info button */}
        <button
          onClick={() => setShowInfoPanel(!showInfoPanel)}
          className={`p-3 rounded-full text-white transition-colors ${
            showInfoPanel ? 'bg-white/20' : 'bg-black/60 hover:bg-black/80'
          }`}
          title={t('fileInfo', 'File info')}
        >
          <FontAwesomeIcon icon={faInfoCircle} className="w-5 h-5" />
        </button>

        {/* 3-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`p-3 rounded-full text-white transition-colors ${
              showMenu ? 'bg-white/20' : 'bg-black/60 hover:bg-black/80'
            }`}
            title={t('moreOptions', 'More options')}
          >
            <FontAwesomeIcon icon={faEllipsisVertical} className="w-5 h-5" />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
              {/* Add to Album — owner only */}
              {!isShareMode && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onAddToAlbum?.(file);
                  }}
                  className="w-full flex items-center px-4 py-3 text-white hover:bg-zinc-800 transition-colors text-sm"
                >
                  <FontAwesomeIcon
                    icon={faPlus}
                    className="w-5 h-5 mr-3 text-gray-400"
                  />
                  {t('addToAlbum', 'Add to Album')}
                </button>
              )}

              {/* Download */}
              <button
                onClick={() => {
                  setShowMenu(false);
                  handleDownload();
                }}
                disabled={downloading}
                className="w-full flex items-center px-4 py-3 text-white hover:bg-zinc-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <div className="animate-spin h-5 w-5 mr-3 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <FontAwesomeIcon
                    icon={faDownload}
                    className="w-5 h-5 mr-3 text-gray-400"
                  />
                )}
                {downloading
                  ? t('downloading', 'Downloading...')
                  : t('download', 'Download')}
              </button>

              {/* Share — owner only */}
              {!isShareMode && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onShare?.(file);
                  }}
                  className="w-full flex items-center px-4 py-3 text-white hover:bg-zinc-800 transition-colors text-sm"
                >
                  <FontAwesomeIcon
                    icon={faShare}
                    className="w-5 h-5 mr-3 text-gray-400"
                  />
                  {t('share', 'Share')}
                </button>
              )}

              {/* Divider + Delete — owner only */}
              {!isShareMode && (
                <>
                  <div className="border-t border-zinc-700" />
                  <button
                    onClick={handleDeleteFile}
                    className="w-full flex items-center px-4 py-3 text-red-400 hover:bg-zinc-800 transition-colors text-sm"
                  >
                    <FontAwesomeIcon
                      icon={faTrash}
                      className="w-5 h-5 mr-3 text-red-400"
                    />
                    {t('delete', 'Delete')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-3 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
        >
          <FontAwesomeIcon icon={faXmark} className="w-6 h-6" />
        </button>
      </div>

      {/* Quality indicator - top left, subtle */}
      {displayUrl && !isFullQuality && (
        <div
          className={`absolute top-4 left-4 z-20 px-3 py-1.5 bg-black/60 rounded-full text-xs text-gray-300 transition-all duration-300 ${
            showCloseButton ? 'opacity-100' : 'opacity-0'
          }`}
        ></div>
      )}

      {/* Left navigation arrow - overlaid on image */}
      {hasPrev && (
        <button
          onClick={onPrev}
          className={`absolute left-4 top-1/2 -translate-y-1/2 z-20 p-4 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all duration-300 ${
            showLeftArrow ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <FontAwesomeIcon icon={faChevronLeft} className="w-8 h-8" />
        </button>
      )}

      {/* Right navigation arrow - overlaid on image */}
      {hasNext && (
        <button
          onClick={onNext}
          className={`absolute right-4 top-1/2 -translate-y-1/2 z-20 p-4 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all duration-300 ${
            showRightArrow ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <FontAwesomeIcon icon={faChevronRight} className="w-8 h-8" />
        </button>
      )}

      {/* Info Panel Sidebar */}
      <div
        className={`absolute top-0 right-0 h-full w-80 bg-zinc-900/95 backdrop-blur-sm border-l border-zinc-700 z-30 transform transition-transform duration-300 ${
          showInfoPanel ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Panel Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-700">
            <h3 className="text-white font-medium">
              {t('fileInfo', 'File Info')}
            </h3>
            <button
              onClick={() => setShowInfoPanel(false)}
              className="p-2 hover:bg-zinc-800 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Date & Time */}
            <div className="space-y-1">
              <div className="text-white text-lg font-medium">
                {formatDateFull(file?.createdAt)}
              </div>
              <div className="text-gray-400 text-sm">
                {formatTime(file?.createdAt)}
              </div>
            </div>

            {/* Filename */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  {t('filename', 'Filename')}
                </div>
                {!isShareMode && (
                  <button
                    onClick={() => setShowRenameModal(true)}
                    className="p-1 hover:bg-zinc-800 rounded text-gray-400 hover:text-white transition-colors"
                    title={t('renameFile', 'Rename file')}
                  >
                    <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="text-white text-sm break-all">
                {decryptedFileName || t('unknown', 'Unknown')}
              </div>
            </div>

            {/* Resolution & Megapixels */}
            {file?.width && file?.height && (
              <div className="space-y-1">
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  {t('resolution', 'Resolution')}
                </div>
                <div className="text-white text-sm">
                  {getMegapixels(file.width, file.height)} • {file.width} ×{' '}
                  {file.height}
                </div>
              </div>
            )}

            {/* File Size */}
            <div className="space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wide">
                {t('size', 'Size')}
              </div>
              <div className="text-white text-sm">
                {formatFileSize(file?.sizeBytes)}
              </div>
            </div>

            {/* Category */}
            {getCategory(file?.mimeType) && (
              <div className="space-y-1">
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  {t('type', 'Type')}
                </div>
                <div className="text-white text-sm">
                  {getCategory(file?.mimeType)}
                </div>
              </div>
            )}

            {/* Video Duration */}
            {isVideoFile && file?.duration && (
              <div className="space-y-1">
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  {t('duration', 'Duration')}
                </div>
                <div className="text-white text-sm">
                  {formatVideoDuration(file.duration)}
                </div>
              </div>
            )}

            {/* MIME Type */}
            <div className="space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wide">
                {t('format', 'Format')}
              </div>
              <div className="text-white text-sm">
                {file?.mimeType || t('unknown', 'Unknown')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rename Modal — owner only */}
      {!isShareMode && (
        <RenameModal
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          currentName={decryptedFileName || 'Unknown'}
          onRename={handleRename}
          isRenaming={isRenaming}
        />
      )}
    </div>
  );
};

export default PhotoViewer;
