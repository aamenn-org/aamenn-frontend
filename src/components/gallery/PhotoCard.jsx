import { useState, useEffect, useRef } from 'react';
import BlurhashCanvas from './BlurhashCanvas';
import { useAuth } from '../../context';
import { thumbnailCache } from '../../services/cache/thumbnail-cache';
import { fileService } from '../../services';
import { getFileType, FILE_HANDLERS, isVideo, formatVideoDuration } from '../../utils/thumbnail';
import { decryptFilename } from '../../utils/crypto';

const PhotoCard = ({
  file,
  isSelected,
  onSelect,
  onView,
  onFavoriteToggle,
  mimeType,
  isVisible = true, // New prop: whether this card is currently visible
}) => {
  const { getMasterKey, getMasterKeyBytes, hasMasterKey } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(file.isFavorite || false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [decryptedFileName, setDecryptedFileName] = useState(null);

  // AbortController for cancelling thumbnail load
  const abortControllerRef = useRef(null);
  // Track if we've already preloaded medium for this file
  const mediumPreloadedRef = useRef(false);

  // Check file types using clean file type system
  const fileMime = file.mimeType || mimeType;
  const fileType = getFileType(fileMime);
  const handler = FILE_HANDLERS[fileType];
  const isVideoFile = isVideo(fileMime);
  const isDocFile = fileType === 'document';

  // Decrypt filename for document files
  useEffect(() => {
    const decrypt = async () => {
      if (!isDocFile || !file?.fileNameEncrypted || !getMasterKey()) {
        setDecryptedFileName(null);
        return;
      }
      try {
        const name = await decryptFilename(file.fileNameEncrypted, getMasterKey());
        setDecryptedFileName(name);
      } catch (err) {
        console.warn('[PhotoCard] Failed to decrypt filename:', err);
        setDecryptedFileName(null);
      }
    };
    decrypt();
  }, [isDocFile, file?.fileNameEncrypted, getMasterKey]);

  // Update local state when file prop changes
  useEffect(() => {
    setIsFavorite(file.isFavorite || false);
  }, [file.isFavorite]);

  // Load thumbnail using cache system with priority and cancellation
  useEffect(() => {
    const fileId = file.fileId;

    // Early return for files that don't support thumbnails
    if (!handler.hasThumbnails || !file.thumbSmallUrl || !hasMasterKey() || !file.cipherFileKey) {
      return;
    }

    // Cancel any previous load operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this load
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const loadThumbnail = async () => {
      try {
        setDecrypting(true);
        const masterKey = getMasterKey();

        if (!masterKey) return;

        // Get pre-exported key bytes to avoid repeated exportKey calls
        const masterKeyBytes = getMasterKeyBytes();

        // Use priority-based loading with file type handler
        if (handler.hasThumbnails && file.thumbSmallUrl) {
          const url = await thumbnailCache.getThumbnailWithPriority(
            fileId,
            file.thumbSmallUrl,
            masterKey,
            file.cipherFileKey,
            {
              priority: isVisible ? 'high' : 'normal',
              signal: abortController.signal,
              masterKeyBytes,
            }
          );

          if (!abortController.signal.aborted) {
            setThumbnailUrl(url);
          }
        } else {
          // No thumbnail available (documents, other files) - show file type icon
          setThumbnailUrl(null);
        }
      } catch (error) {
        // Ignore abort errors - they're expected when scrolling
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Failed to load thumbnail:', error);
        if (!abortController.signal.aborted) {
          setImageError(true);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setDecrypting(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      // Cancel load when unmounting or when visibility changes
      abortController.abort();
    };
  }, [
    file.fileId,
    file.id,
    file.thumbSmallUrl,
    hasMasterKey,
    getMasterKey,
    isVisible,
    fileType,
    handler,
  ]);

  // Preload medium thumbnail on hover for instant viewer opening
  // This eliminates blurhash delay when user clicks to view
  useEffect(() => {
    if (!isHovered || mediumPreloadedRef.current) return;
    if (!file?.thumbMediumUrl) return;
    if (!hasMasterKey()) return;

    // Check if already in L1 cache
    if (thumbnailCache.getMediumFromMemory(file.fileId)) {
      mediumPreloadedRef.current = true;
      return;
    }

    // Preload medium in background (fire and forget)
    const preloadMedium = async () => {
      try {
        const masterKey = getMasterKey();
        if (!masterKey) return;

        // Load medium thumbnail into L1 cache
        await thumbnailCache.getMediumThumbnail(
          file.fileId,
          file.thumbMediumUrl,
          masterKey // Use master key directly instead of cipherThumbMediumKey
        );
        
        mediumPreloadedRef.current = true;
        console.log(`[PhotoCard] Preloaded medium for ${file.fileId} on hover`);
      } catch (err) {
        // Silently fail - not critical
        console.debug('[PhotoCard] Medium preload failed:', err);
      }
    };

    // Delay preload slightly to avoid loading on accidental hovers
    const timer = setTimeout(preloadMedium, 300);
    return () => clearTimeout(timer);
  }, [
    isHovered,
    file?.fileId,
    file?.thumbMediumUrl,
    hasMasterKey,
    getMasterKey,
  ]);

  // Get icon based on mime type
  const getFileIcon = () => {
    if (mimeType?.startsWith('video/')) {
      return (
        <svg
          className="w-10 h-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    }
    return (
      <svg
        className="w-10 h-10 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    );
  };

  const hasBlurhash = false; // Blurhash removed in simplification
  const showBlurhash = false; // Blurhash removed in simplification

  return (
    <div
      className={`
        relative aspect-square overflow-hidden cursor-pointer
        transition-all duration-200 group bg-gray-200 dark:bg-zinc-700
        ${
          isSelected
            ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-50 dark:ring-offset-zinc-900'
            : ''
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onView?.(file)}
      title="Hover to preload, click to view"
    >
      {/* Document file card - show Font Awesome icon */}
      {isDocFile ? (
        <div className="w-full h-full bg-zinc-800 flex flex-col items-center justify-center gap-2 p-2">
          <i className={`fa-solid ${
            typeof handler.iconClass === 'function' 
              ? handler.iconClass(fileMime) 
              : handler.iconClass
          } text-4xl ${
            typeof handler.iconColor === 'function'
              ? handler.iconColor(fileMime)
              : handler.iconColor
          }`}></i>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {fileType === 'document' ? (
              fileMime.includes('pdf') ? 'PDF' :
              fileMime.includes('word') ? 'DOCX' :
              fileMime.includes('text') ? 'TXT' : 'DOC'
            ) : 'FILE'}
          </span>
          {decryptedFileName && (
            <span className="text-xs text-gray-300 text-center line-clamp-2 w-full px-1 break-words">
              {decryptedFileName}
            </span>
          )}
        </div>
      ) : (
        <>
          {/* Decrypted thumbnail image */}
          {thumbnailUrl && !imageError ? (
            <img
              src={thumbnailUrl}
              alt="Photo"
              style={{
                // Force complete coverage with slight overflow to prevent sub-pixel gaps
                position: 'absolute',
                top: '-1px',
                left: '-1px',
                right: '-1px',
                width: 'calc(100% + 2px)',
                height: 'calc(100% + 2px)',
                objectFit: 'cover',
                // Force GPU rendering to avoid sub-pixel artifacts
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
              }}
              className={`
                z-10 transition-all duration-300
                group-hover:scale-105
                ${imageLoaded ? 'opacity-100' : 'opacity-0'}
              `}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : !decrypting ? (
            /* Fallback placeholder when no thumbnail */
            <div className="w-full h-full bg-gray-200 dark:bg-zinc-700 flex flex-col items-center justify-center">
              {getFileIcon()}
            </div>
          ) : null}

          {/* Background color layer - only shows when no image loaded yet */}
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gray-200 dark:bg-zinc-700 z-0" />
          )}

          {/* Video indicator overlay - shows play icon and duration */}
          {isVideoFile && imageLoaded && (
            <>
              {/* Play icon in center */}
              <div className="absolute inset-0 flex items-center justify-center z-15 pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  <svg
                    className="w-6 h-6 text-white ml-0.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Duration badge in bottom right */}
              {file.duration && (
                <div className="absolute bottom-2 end-2 z-15 px-1.5 py-0.5 bg-black/70 rounded text-white text-xs font-medium pointer-events-none">
                  {formatVideoDuration(file.duration)}
                </div>
              )}
            </>
          )}

          {/* Loading indicator */}
          {decrypting && !imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200/80 dark:bg-zinc-700/80 z-20">
              <svg
                className="animate-spin w-6 h-6 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </>
      )}

      {/* Selection Checkbox */}
      <div
        className={`
          absolute top-2 start-2 w-6 h-6 border-2 z-30
          flex items-center justify-center
          transition-all duration-200
          ${
            isSelected
              ? 'bg-blue-500 border-blue-500'
              : isHovered
              ? 'bg-black/50 border-white/50'
              : 'opacity-0'
          }
        `}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(file);
        }}
      >
        {isSelected && (
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>

      {/* Favorite Button */}
      <button
        className={`
          absolute top-2 end-2 w-7 h-7  z-30
          flex items-center justify-center
          transition-all duration-200
          ${
            isFavorite
              ? 'bg-red-500 text-white'
              : isHovered
              ? 'bg-black/50 text-white/70 hover:text-white'
              : 'opacity-0'
          }
          ${favoriteLoading ? 'pointer-events-none' : ''}
        `}
        onClick={async (e) => {
          e.stopPropagation();
          if (favoriteLoading) return;

          setFavoriteLoading(true);
          const newFavorite = !isFavorite;
          const fileId = file.fileId;
          setIsFavorite(newFavorite); // Optimistic update

          try {
            await fileService.updateFile(fileId, { isFavorite: newFavorite });
            onFavoriteToggle?.(fileId, newFavorite);
          } catch (error) {
            console.error('Failed to update favorite:', error);
            setIsFavorite(!newFavorite); // Revert on error
          } finally {
            setFavoriteLoading(false);
          }
        }}
      >
        {favoriteLoading ? (
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            fill={isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        )}
      </button>

      {/* Hover Overlay */}
      {isHovered && (
        <div className="absolute inset-0 bg-black/20 transition-opacity duration-200 z-20 pointer-events-none" />
      )}
    </div>
  );
};

export default PhotoCard;
