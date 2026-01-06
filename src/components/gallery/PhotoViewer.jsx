import { useState, useEffect, useRef, useCallback } from 'react';
import { fileService } from '../../services';
import { useAuth } from '../../context';
import { thumbnailCache } from '../../services/cache/thumbnail-cache';
import BlurhashCanvas from './BlurhashCanvas';
import { isVideo, formatVideoDuration } from '../../utils/thumbnail';

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
  // totalFiles - removed, no longer displayed in minimal UI
  onAddToAlbum,
  onDelete,
}) => {
  const { getMasterKey } = useAuth();

  // Determine if this is a video file
  const isVideoFile = isVideo(file?.mimeType);

  // Image/Video URLs - progressive quality
  const [displayUrl, setDisplayUrl] = useState(null);
  const [quality, setQuality] = useState('none'); // none | small | medium | full
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Video-specific state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  // UI visibility states for auto-hide behavior
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [showBottomOverlay, setShowBottomOverlay] = useState(false);
  const [showCloseButton, setShowCloseButton] = useState(true);
  const [showVideoControls, setShowVideoControls] = useState(true);

  // Menu and info panel states
  const [showMenu, setShowMenu] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const menuRef = useRef(null);

  // Timers for auto-hide
  const leftArrowTimerRef = useRef(null);
  const rightArrowTimerRef = useRef(null);
  const bottomOverlayTimerRef = useRef(null);
  const closeButtonTimerRef = useRef(null);
  const videoControlsTimerRef = useRef(null);

  // Track current file to prevent stale updates
  const currentFileIdRef = useRef(null);
  const fileDataRef = useRef(null);

  // Get the best available cached image INSTANTLY (synchronous check)
  const getBestCachedUrl = useCallback((fileId) => {
    // Check L1 memory in order of preference: full > medium > small
    const fullUrl = thumbnailCache.getFullImageFromMemory(fileId);
    if (fullUrl) return { url: fullUrl, quality: 'full' };

    const mediumUrl = thumbnailCache.getMediumFromMemory(fileId);
    if (mediumUrl) return { url: mediumUrl, quality: 'medium' };

    const smallUrl = thumbnailCache.getSmallThumbnailFromMemory(fileId);
    if (smallUrl) return { url: smallUrl, quality: 'small' };

    return { url: null, quality: 'none' };
  }, []);

  // Load and upgrade image quality
  const loadImage = useCallback(
    async (targetFile, fileId) => {
      const masterKey = getMasterKey();
      if (!masterKey) {
        setError('Unable to decrypt. Please log out and log in again.');
        return;
      }

      try {
        // Step 1: Get file metadata (uses cache if offline)
        const fileData = await fileService.getFile(fileId);
        fileDataRef.current = fileData;

        // Check if we're still viewing the same file
        if (currentFileIdRef.current !== fileId) return;

        // Step 2: Load medium thumbnail (if not already at medium/full quality)
        if (
          quality !== 'medium' &&
          quality !== 'full' &&
          fileData.thumbMediumUrl
        ) {
          try {
            const mediumUrl = await thumbnailCache.getMediumThumbnail(
              fileId,
              fileData.thumbMediumUrl,
              fileData.cipherThumbMediumKey,
              masterKey
            );
            if (currentFileIdRef.current === fileId && quality !== 'full') {
              setDisplayUrl(mediumUrl);
              setQuality('medium');
            }
          } catch (err) {
            console.warn('Failed to load medium:', err);
          }
        }

        // Step 3: Load full image
        if (fileData.downloadUrl && fileData.cipherFileKey) {
          const fullUrl = await thumbnailCache.getFullImage(
            fileId,
            fileData.downloadUrl,
            fileData.cipherFileKey,
            masterKey,
            targetFile.mimeType || 'image/jpeg'
          );
          if (currentFileIdRef.current === fileId) {
            setDisplayUrl(fullUrl);
            setQuality('full');
          }
        }
      } catch (err) {
        console.error('Failed to load image:', err);
        if (currentFileIdRef.current === fileId) {
          setError(err.message || 'Failed to load image');
        }
      }
    },
    [getMasterKey, quality]
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
    const masterKey = getMasterKey();
    if (!masterKey || !files.length || currentIndex === undefined) return;

    const zone = fullPreloadZoneRef.current;

    // Check if current index is outside the full preload zone
    const needsPreload =
      zone.left === -1 || currentIndex < zone.left || currentIndex > zone.right;

    if (!needsPreload) return;

    // Calculate new zone centered on current
    const newLeft = Math.max(0, currentIndex - FULL_PRELOAD_SIZE);
    const newRight = Math.min(
      files.length - 1,
      currentIndex + FULL_PRELOAD_SIZE
    );

    // Collect file IDs that need full preload
    const adjacentFileIds = [];
    for (let i = newLeft; i <= newRight; i++) {
      const file = files[i];
      const fileId = file?.fileId || file?.id;
      if (fileId && !thumbnailCache.getFullImageFromMemory(fileId)) {
        adjacentFileIds.push(fileId);
      }
    }

    // Update zone
    fullPreloadZoneRef.current = { left: newLeft, right: newRight };

    if (adjacentFileIds.length === 0) return;

    console.log(
      `[PhotoViewer] Preloading ${adjacentFileIds.length} FULL images around index ${currentIndex}`
    );

    try {
      const { files: filesMetadata } = await fileService.getFilesBatch(
        adjacentFileIds
      );
      if (filesMetadata?.length > 0) {
        await thumbnailCache.batchPreloadFull(
          filesMetadata.map((f) => ({
            fileId: f.fileId,
            downloadUrl: f.downloadUrl,
            cipherFileKey: f.cipherFileKey,
            mimeType: f.mimeType,
          })),
          masterKey
        );
      }
    } catch (error) {
      console.warn('[PhotoViewer] Full preload failed:', error);
    }
  }, [getMasterKey, files, currentIndex]);

  // Preload MEDIUM images for ±10 zone (instant display when navigating)
  const preloadMediumAdjacent = useCallback(async () => {
    const masterKey = getMasterKey();
    if (!masterKey || !files.length || currentIndex === undefined) return;

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
        `[PhotoViewer] Within zone [${zone.left}-${zone.right}], index=${currentIndex}, skipping preload`
      );
      return;
    }

    // Determine which direction to extend the zone
    let newLeft = zone.left;
    let newRight = zone.right;
    const adjacentFileIds = [];

    if (isFirstLoad) {
      // First load: preload ±PRELOAD_ZONE_SIZE around current position
      newLeft = Math.max(0, currentIndex - PRELOAD_ZONE_SIZE);
      newRight = Math.min(files.length - 1, currentIndex + PRELOAD_ZONE_SIZE);
      console.log(`[PhotoViewer] Initial zone load: [${newLeft}-${newRight}]`);
    } else if (approachingLeftBoundary && zone.left > 0) {
      // Extend zone to the left
      newLeft = Math.max(0, zone.left - PRELOAD_ZONE_SIZE);
      console.log(
        `[PhotoViewer] Extending zone LEFT: [${newLeft}-${zone.right}]`
      );
    } else if (approachingRightBoundary && zone.right < files.length - 1) {
      // Extend zone to the right
      newRight = Math.min(files.length - 1, zone.right + PRELOAD_ZONE_SIZE);
      console.log(
        `[PhotoViewer] Extending zone RIGHT: [${zone.left}-${newRight}]`
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

      const file = files[i];
      const fileId = file?.fileId || file?.id;
      // Skip if already preloaded OR has medium thumbnail in memory
      if (
        fileId &&
        !preloadedFileIdsRef.current.has(fileId) &&
        !thumbnailCache.getMediumFromMemory(fileId)
      ) {
        adjacentFileIds.push(fileId);
      }
    }

    // Update zone boundaries
    preloadZoneRef.current = {
      left: isFirstLoad ? newLeft : Math.min(zone.left, newLeft),
      right: isFirstLoad ? newRight : Math.max(zone.right, newRight),
    };

    if (adjacentFileIds.length === 0) {
      console.log(
        '[PhotoViewer] All files in new zone already preloaded/cached'
      );
      return;
    }

    // Mark these as preloaded BEFORE making the request to prevent race conditions
    adjacentFileIds.forEach((id) => preloadedFileIdsRef.current.add(id));

    console.log(
      `[PhotoViewer] Batch preloading ${adjacentFileIds.length} adjacent files`
    );

    try {
      // Batch fetch metadata for all adjacent files in ONE request
      const { files: filesMetadata } = await fileService.getFilesBatch(
        adjacentFileIds
      );

      if (filesMetadata && filesMetadata.length > 0) {
        // Batch preload all images with controlled concurrency
        await thumbnailCache.batchPreload(
          filesMetadata.map((f) => ({
            fileId: f.fileId,
            downloadUrl: f.downloadUrl,
            cipherFileKey: f.cipherFileKey,
            thumbMediumUrl: f.thumbMediumUrl,
            cipherThumbMediumKey: f.cipherThumbMediumKey,
            mimeType: f.mimeType,
          })),
          masterKey,
          { prioritizeMedium: true }
        );
      }
    } catch (error) {
      console.warn('[PhotoViewer] Batch preload failed:', error);
    }
  }, [getMasterKey, files, currentIndex]);

  // Load video file
  const loadVideo = useCallback(
    async (targetFile, fileId) => {
      const masterKey = getMasterKey();
      if (!masterKey) {
        setError('Unable to decrypt. Please log out and log in again.');
        return;
      }

      try {
        // Get file metadata
        const fileData = await fileService.getFile(fileId);
        fileDataRef.current = fileData;

        // Check if we're still viewing the same file
        if (currentFileIdRef.current !== fileId) return;

        // Load full video
        if (fileData.downloadUrl && fileData.cipherFileKey) {
          const videoUrl = await thumbnailCache.getFullImage(
            fileId,
            fileData.downloadUrl,
            fileData.cipherFileKey,
            masterKey,
            targetFile.mimeType || 'video/mp4'
          );
          if (currentFileIdRef.current === fileId) {
            setDisplayUrl(videoUrl);
            setQuality('full');
          }
        }
      } catch (err) {
        console.error('Failed to load video:', err);
        if (currentFileIdRef.current === fileId) {
          setError(err.message || 'Failed to load video');
        }
      }
    },
    [getMasterKey]
  );

  // Main effect: Handle file changes INSTANTLY
  useEffect(() => {
    if (!isOpen || !file) return;

    const fileId = file.fileId || file.id;
    if (!fileId) return;

    // Track current file
    currentFileIdRef.current = fileId;
    setError(null);

    // Reset video state when changing files
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(false);

    // Check if this is a video
    const currentIsVideo = isVideo(file?.mimeType);

    if (currentIsVideo) {
      // For videos: check if already cached, otherwise show loading state
      const cached = getBestCachedUrl(fileId);
      if (cached.url) {
        setDisplayUrl(cached.url);
        setQuality(cached.quality);
      } else {
        setDisplayUrl(null);
        setQuality('none');
      }
      loadVideo(file, fileId);
    } else {
      // INSTANT: Check memory cache synchronously for images
      const cached = getBestCachedUrl(fileId);
      if (cached.url) {
        // We have something cached - show it IMMEDIATELY
        setDisplayUrl(cached.url);
        setQuality(cached.quality);
        console.log(`[PhotoViewer] Instant display from L1: ${cached.quality}`);
      } else {
        // Nothing in memory - show blurhash, will load async
        setDisplayUrl(null);
        setQuality('none');
      }

      // Start loading better quality in background
      loadImage(file, fileId);
    }

    // Preload adjacent images after a short delay (skip videos for now)
    // Full images first (immediate ±2), then medium (±10 zone)
    const fullPreloadTimer = setTimeout(preloadFullAdjacent, 100);
    const mediumPreloadTimer = setTimeout(preloadMediumAdjacent, 500);

    return () => {
      clearTimeout(fullPreloadTimer);
      clearTimeout(mediumPreloadTimer);
    };
  }, [
    file?.fileId,
    file?.id,
    file?.mimeType,
    isOpen,
    getBestCachedUrl,
    loadImage,
    loadVideo,
    preloadFullAdjacent,
    preloadMediumAdjacent,
  ]);

  const handleDownload = async () => {
    if (!displayUrl) return;

    setDownloading(true);
    try {
      const response = await fetch(displayUrl);
      const blob = await response.blob();

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const extension = isVideoFile ? 'mp4' : 'jpg';
      link.download =
        file.originalName || file.fileNameEncrypted || `media.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  // Video control functions
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleSeek = useCallback((e) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    videoRef.current.currentTime = percentage * videoRef.current.duration;
  }, []);

  const handleVolumeChange = useCallback((e) => {
    if (!videoRef.current) return;
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  const skipTime = useCallback((seconds) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(
      0,
      Math.min(
        videoRef.current.duration,
        videoRef.current.currentTime + seconds
      )
    );
  }, []);

  // Video event handlers
  const handleVideoPlay = useCallback(() => setIsPlaying(true), []);
  const handleVideoPause = useCallback(() => setIsPlaying(false), []);
  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);
  const handleVideoWaiting = useCallback(() => setIsBuffering(true), []);
  const handleVideoPlaying = useCallback(() => setIsBuffering(false), []);
  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // Handle click on video to toggle play (ente.io style)
  const handleVideoClick = useCallback(
    (e) => {
      // Don't toggle if clicking on controls
      if (e.target.closest('.video-controls')) return;
      togglePlay();
    },
    [togglePlay]
  );

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format date with full details for info panel
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

  // Calculate megapixels from resolution
  const getMegapixels = (width, height) => {
    if (!width || !height) return null;
    const mp = (width * height) / 1000000;
    return mp >= 1 ? `${mp.toFixed(1)}MP` : `${(mp * 1000).toFixed(0)}K`;
  };

  // Get file category based on mime type
  const getCategory = (mimeType) => {
    if (!mimeType) return null;
    if (mimeType.startsWith('image/')) return 'Photo';
    if (mimeType.startsWith('video/')) return 'Video';
    return null;
  };

  // Handle delete action
  const handleDeleteFile = async () => {
    if (!file) return;
    const fileId = file.fileId || file.id;

    const confirmMessage =
      'Are you sure you want to permanently delete this file? This action cannot be undone.';
    if (!window.confirm(confirmMessage)) return;

    setShowMenu(false);
    onDelete?.(fileId);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  // Auto-hide timer helpers
  const startAutoHideTimer = useCallback((timerRef, setVisibility) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setVisibility(false);
    }, AUTO_HIDE_DELAY);
  }, []);

  const clearAutoHideTimer = useCallback((timerRef) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Mouse move handler for zone-based visibility
  const handleMouseMove = useCallback(
    (e) => {
      const { clientX, clientY } = e;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Left zone (15% of screen width)
      const leftZone = windowWidth * 0.15;
      // Right zone (15% of screen width)
      const rightZone = windowWidth * 0.85;
      // Bottom zone (20% of screen height)
      const bottomZone = windowHeight * 0.8;
      // Top zone for close button (10% of screen height)
      const topZone = windowHeight * 0.1;

      // Handle left arrow visibility
      if (clientX < leftZone && hasPrev) {
        setShowLeftArrow(true);
        clearAutoHideTimer(leftArrowTimerRef);
        startAutoHideTimer(leftArrowTimerRef, setShowLeftArrow);
      }

      // Handle right arrow visibility
      if (clientX > rightZone && hasNext) {
        setShowRightArrow(true);
        clearAutoHideTimer(rightArrowTimerRef);
        startAutoHideTimer(rightArrowTimerRef, setShowRightArrow);
      }

      // Handle bottom overlay visibility (includes video controls)
      if (clientY > bottomZone) {
        setShowBottomOverlay(true);
        setShowVideoControls(true);
        clearAutoHideTimer(bottomOverlayTimerRef);
        clearAutoHideTimer(videoControlsTimerRef);
        startAutoHideTimer(bottomOverlayTimerRef, setShowBottomOverlay);
        startAutoHideTimer(videoControlsTimerRef, setShowVideoControls);
      }

      // Handle close button visibility (top area or any movement)
      if (clientY < topZone) {
        setShowCloseButton(true);
        clearAutoHideTimer(closeButtonTimerRef);
        startAutoHideTimer(closeButtonTimerRef, setShowCloseButton);
      }
    },
    [hasPrev, hasNext, startAutoHideTimer, clearAutoHideTimer]
  );

  // Mouse leave handler - start all hide timers
  const handleMouseLeave = useCallback(() => {
    startAutoHideTimer(leftArrowTimerRef, setShowLeftArrow);
    startAutoHideTimer(rightArrowTimerRef, setShowRightArrow);
    startAutoHideTimer(bottomOverlayTimerRef, setShowBottomOverlay);
    startAutoHideTimer(closeButtonTimerRef, setShowCloseButton);
    startAutoHideTimer(videoControlsTimerRef, setShowVideoControls);
  }, [startAutoHideTimer]);

  // Show controls initially then auto-hide
  useEffect(() => {
    if (isOpen) {
      // Show all controls initially
      setShowLeftArrow(hasPrev);
      setShowRightArrow(hasNext);
      setShowBottomOverlay(true);
      setShowCloseButton(true);
      setShowVideoControls(true);

      // Start auto-hide timers
      startAutoHideTimer(leftArrowTimerRef, setShowLeftArrow);
      startAutoHideTimer(rightArrowTimerRef, setShowRightArrow);
      startAutoHideTimer(bottomOverlayTimerRef, setShowBottomOverlay);
      startAutoHideTimer(closeButtonTimerRef, setShowCloseButton);
      startAutoHideTimer(videoControlsTimerRef, setShowVideoControls);
    }

    return () => {
      clearAutoHideTimer(leftArrowTimerRef);
      clearAutoHideTimer(rightArrowTimerRef);
      clearAutoHideTimer(bottomOverlayTimerRef);
      clearAutoHideTimer(closeButtonTimerRef);
      clearAutoHideTimer(videoControlsTimerRef);
    };
  }, [isOpen, hasPrev, hasNext, startAutoHideTimer, clearAutoHideTimer]);

  // Handle keyboard navigation (with video shortcuts)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      // Show controls briefly on any key press
      setShowLeftArrow(hasPrev);
      setShowRightArrow(hasNext);
      setShowBottomOverlay(true);
      setShowCloseButton(true);
      setShowVideoControls(true);

      // Restart auto-hide timers
      startAutoHideTimer(leftArrowTimerRef, setShowLeftArrow);
      startAutoHideTimer(rightArrowTimerRef, setShowRightArrow);
      startAutoHideTimer(bottomOverlayTimerRef, setShowBottomOverlay);
      startAutoHideTimer(closeButtonTimerRef, setShowCloseButton);
      startAutoHideTimer(videoControlsTimerRef, setShowVideoControls);

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (isVideoFile && videoRef.current) {
            e.preventDefault();
            skipTime(-10);
          } else if (hasPrev) {
            onPrev();
          }
          break;
        case 'ArrowRight':
          if (isVideoFile && videoRef.current) {
            e.preventDefault();
            skipTime(10);
          } else if (hasNext) {
            onNext();
          }
          break;
        case ' ':
          if (isVideoFile) {
            e.preventDefault();
            togglePlay();
          }
          break;
        case 'm':
        case 'M':
          if (isVideoFile) {
            e.preventDefault();
            toggleMute();
          }
          break;
        case 'f':
        case 'F':
          if (isVideoFile) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    onClose,
    onNext,
    onPrev,
    hasNext,
    hasPrev,
    startAutoHideTimer,
    isVideoFile,
    skipTime,
    togglePlay,
    toggleMute,
    toggleFullscreen,
  ]);

  if (!isOpen) return null;

  // Determine loading state - only show blurhash if we have NOTHING cached
  const isLoading = !displayUrl;
  const hasBlurhash = file.blurhash && file.blurhash.length > 0;
  const isFullQuality = quality === 'full';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Full-screen media container */}
      <div className="w-full h-full flex items-center justify-center">
        {/* Error State */}
        {error && !displayUrl ? (
          <div className="flex flex-col items-center justify-center text-gray-400">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d={
                  isVideoFile
                    ? 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
                    : 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
                }
              />
            </svg>
            <p>{error}</p>
          </div>
        ) : isVideoFile ? (
          /* Video Player */
          <>
            {/* Blurhash placeholder while video loads */}
            {hasBlurhash && !displayUrl && (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="max-w-full max-h-full"
                  style={{
                    aspectRatio:
                      file.width && file.height
                        ? `${file.width}/${file.height}`
                        : '16/9',
                    width: '100%',
                    height: '100%',
                    maxWidth: file.width ? `${file.width}px` : '100%',
                    maxHeight: file.height ? `${file.height}px` : '100%',
                  }}
                >
                  <BlurhashCanvas
                    hash={file.blurhash}
                    width={64}
                    height={64}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}

            {/* Loading spinner for video */}
            {!displayUrl && !hasBlurhash && (
              <div className="flex flex-col items-center justify-center text-gray-400">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent mb-4"></div>
                <p>Loading video...</p>
              </div>
            )}

            {/* Video element */}
            {displayUrl && (
              <div
                className="relative w-full h-full flex items-center justify-center cursor-pointer"
                onClick={handleVideoClick}
              >
                <video
                  ref={videoRef}
                  src={displayUrl}
                  className="max-w-full max-h-full object-contain"
                  playsInline
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onWaiting={handleVideoWaiting}
                  onPlaying={handleVideoPlaying}
                  onEnded={handleVideoEnded}
                />

                {/* Buffering indicator */}
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-white/30 border-t-white"></div>
                  </div>
                )}

                {/* Big play button when paused */}
                {!isPlaying && !isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm transition-transform hover:scale-110">
                      <svg
                        className="w-10 h-10 text-white ml-1"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Image Display */
          <>
            {/* Blurhash placeholder (shown while loading) */}
            {hasBlurhash && !displayUrl && (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="max-w-full max-h-full"
                  style={{
                    aspectRatio:
                      file.width && file.height
                        ? `${file.width}/${file.height}`
                        : '16/9',
                    width: '100%',
                    height: '100%',
                    maxWidth: file.width ? `${file.width}px` : '100%',
                    maxHeight: file.height ? `${file.height}px` : '100%',
                  }}
                >
                  <BlurhashCanvas
                    hash={file.blurhash}
                    width={64}
                    height={64}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}

            {/* Empty placeholder (no blurhash) */}
            {!hasBlurhash && isLoading && (
              <div className="flex items-center justify-center w-full h-full">
                {/* No spinner - just wait for image */}
              </div>
            )}

            {/* Actual image - full screen with aspect ratio preserved */}
            {displayUrl && (
              <img
                src={displayUrl}
                alt="Photo"
                className="w-full h-full object-contain"
                draggable={false}
              />
            )}
          </>
        )}
      </div>

      {/* Video Controls - Modern minimal design */}
      {isVideoFile && displayUrl && (
        <div
          className={`video-controls absolute bottom-0 left-0 right-0 z-30 transition-all duration-300 ${
            showVideoControls
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 pb-4 px-4">
            {/* Progress bar */}
            <div
              className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-4 group"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-white rounded-full relative transition-all"
                style={{
                  width: `${
                    duration > 0 ? (currentTime / duration) * 100 : 0
                  }%`,
                }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? (
                    <svg
                      className="w-6 h-6 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-6 h-6 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Skip backward */}
                <button
                  onClick={() => skipTime(-10)}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Rewind 10s"
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
                  </svg>
                </button>

                {/* Skip forward */}
                <button
                  onClick={() => skipTime(10)}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Forward 10s"
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                  </svg>
                </button>

                {/* Volume */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  >
                    {isMuted || volume === 0 ? (
                      <svg
                        className="w-5 h-5 text-white"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-white"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                  />
                </div>

                {/* Time display */}
                <span className="text-white text-sm font-medium">
                  {formatVideoDuration(currentTime)} /{' '}
                  {formatVideoDuration(duration)}
                </span>
              </div>

              <div className="flex items-center space-x-4">
                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? (
                    <svg
                      className="w-5 h-5 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          title="File info"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        {/* 3-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`p-3 rounded-full text-white transition-colors ${
              showMenu ? 'bg-white/20' : 'bg-black/60 hover:bg-black/80'
            }`}
            title="More options"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
              {/* Add to Album */}
              <button
                onClick={() => {
                  setShowMenu(false);
                  onAddToAlbum?.(file);
                }}
                className="w-full flex items-center px-4 py-3 text-white hover:bg-zinc-800 transition-colors text-sm"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add to Album
              </button>

              {/* Download */}
              <button
                onClick={() => {
                  setShowMenu(false);
                  handleDownload();
                }}
                disabled={!displayUrl || downloading}
                className="w-full flex items-center px-4 py-3 text-white hover:bg-zinc-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <div className="animate-spin h-5 w-5 mr-3 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <svg
                    className="w-5 h-5 mr-3 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                )}
                Download
              </button>

              {/* Divider */}
              <div className="border-t border-zinc-700" />

              {/* Delete */}
              <button
                onClick={handleDeleteFile}
                className="w-full flex items-center px-4 py-3 text-red-400 hover:bg-zinc-800 transition-colors text-sm"
              >
                <svg
                  className="w-5 h-5 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-3 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Quality indicator - top left, subtle */}
      {displayUrl && !isFullQuality && (
        <div
          className={`absolute top-4 left-4 z-20 px-3 py-1.5 bg-black/60 rounded-full text-xs text-gray-300 transition-all duration-300 ${
            showCloseButton ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {quality === 'small' ? 'Preview' : 'HD'} • Loading full...
        </div>
      )}

      {/* Left navigation arrow - overlaid on image */}
      {hasPrev && (
        <button
          onClick={onPrev}
          className={`absolute left-4 top-1/2 -translate-y-1/2 z-20 p-4 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all duration-300 ${
            showLeftArrow ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
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
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
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
            <h3 className="text-white font-medium">File Info</h3>
            <button
              onClick={() => setShowInfoPanel(false)}
              className="p-2 hover:bg-zinc-800 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
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
              <div className="text-gray-500 text-xs uppercase tracking-wide">
                Filename
              </div>
              <div className="text-white text-sm break-all">
                {file?.originalName || file?.fileNameEncrypted || 'Unknown'}
              </div>
            </div>

            {/* Resolution & Megapixels */}
            {file?.width && file?.height && (
              <div className="space-y-1">
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Resolution
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
                Size
              </div>
              <div className="text-white text-sm">
                {formatFileSize(file?.sizeBytes)}
              </div>
            </div>

            {/* Category */}
            {getCategory(file?.mimeType) && (
              <div className="space-y-1">
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Type
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
                  Duration
                </div>
                <div className="text-white text-sm">
                  {formatVideoDuration(file.duration)}
                </div>
              </div>
            )}

            {/* MIME Type */}
            <div className="space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wide">
                Format
              </div>
              <div className="text-white text-sm">
                {file?.mimeType || 'Unknown'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoViewer;
