import { useState, useEffect, useRef } from 'react';
import { setDragState } from '../../utils/dragState';
import BlurhashCanvas from './BlurhashCanvas';
import { useAuth } from '../../context';
import { thumbnailCache } from '../../services/cache/thumbnail-cache';
import { fileService } from '../../services';
import { getFileType, FILE_HANDLERS, isVideo, formatVideoDuration } from '../../utils/thumbnail';
import { decryptFilename } from '../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faVideo, 
  faFile, 
  faFilePdf,
  faFileWord,
  faFileLines,
  faPlay, 
  faSpinner, 
  faSquareCheck, 
  faHeart,
  faCheck 
} from '@fortawesome/free-solid-svg-icons';

const PhotoCard = ({
  file,
  isSelected,
  onSelect,
  onView,
  onFavoriteToggle,
  mimeType,
  isVisible = true,
  selectedFileIds = [], // IDs of all currently selected files
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
  // Track current visibility without re-triggering the load effect
  const isVisibleRef = useRef(isVisible);
  // Track if we've already preloaded medium for this file
  const mediumPreloadedRef = useRef(false);

  // Keep isVisibleRef in sync without causing re-renders or effect re-runs
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

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
              priority: isVisibleRef.current ? 'high' : 'normal',
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
    fileType,
    handler,
    // isVisible intentionally excluded: visibility changes must NOT abort
    // in-flight loads — only used via isVisibleRef for priority
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
          masterKey,
          file.cipherFileKey
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
        <FontAwesomeIcon icon={faVideo} className="w-10 h-10 text-gray-400" />
      );
    }
    
    // Use specific icons for document types
    if (fileType === 'document') {
      const iconClass = typeof handler.iconClass === 'function' 
        ? handler.iconClass(mimeType)
        : handler.iconClass;
      const iconColor = typeof handler.iconColor === 'function'
        ? handler.iconColor(mimeType)
        : handler.iconColor;
      
      let icon;
      if (mimeType?.includes('pdf')) icon = faFilePdf;
      else if (mimeType?.includes('word') || mimeType?.includes('docx')) icon = faFileWord;
      else if (mimeType?.includes('text') || mimeType?.includes('txt')) icon = faFileLines;
      else icon = faFile;
      
      return (
        <FontAwesomeIcon icon={icon} className={`w-10 h-10 ${iconColor}`} />
      );
    }
    
    return (
      <FontAwesomeIcon icon={faFile} className="w-10 h-10 text-gray-400" />
    );
  };

  const hasBlurhash = false; // Blurhash removed in simplification
  const showBlurhash = false; // Blurhash removed in simplification

  return (
    <div
      className={`
        relative aspect-square overflow-hidden cursor-pointer
        transition-all duration-200 group bg-gray-200 dark:bg-zinc-700
        rounded-lg
        ${
          isSelected
            ? 'border-2 border-blue-500'
            : ''
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          onSelect?.(file);
          return;
        }
        onView?.(file);
      }}
      title="Hover to preload, click to view"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        const fileId = file.fileId || file.id;
        // If this file is part of a selection, drag all selected; otherwise just this one
        const ids = selectedFileIds.includes(fileId) && selectedFileIds.length > 1
          ? selectedFileIds
          : [fileId];
        setDragState({ type: 'files', fileIds: ids });
      }}
    >
      {/* Document file card - show specific Font Awesome icon */}
      {isDocFile ? (
        <div className="w-full h-full bg-gray-100 dark:bg-zinc-800 flex flex-col items-center justify-center gap-2 p-2">
          <FontAwesomeIcon 
            icon={
              fileMime.includes('pdf') ? faFilePdf :
              fileMime.includes('word') || fileMime.includes('docx') ? faFileWord :
              fileMime.includes('text') || fileMime.includes('txt') ? faFileLines :
              faFile
            } 
            className={`text-4xl ${
              fileMime.includes('pdf') ? 'text-red-500 dark:text-red-400' :
              fileMime.includes('word') || fileMime.includes('docx') ? 'text-blue-500 dark:text-blue-400' :
              fileMime.includes('text') || fileMime.includes('txt') ? 'text-gray-500 dark:text-gray-300' :
              'text-gray-500 dark:text-gray-400'
            }`} 
          />
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {fileType === 'document' ? (
              fileMime.includes('pdf') ? 'PDF' :
              fileMime.includes('word') || fileMime.includes('docx') ? 'DOCX' :
              fileMime.includes('text') || fileMime.includes('txt') ? 'TXT' :
              'DOC'
            ) : (
              fileType.toUpperCase()
            )}
          </span>
          {decryptedFileName && (
            <span className="text-xs text-gray-600 dark:text-gray-300 text-center line-clamp-2 w-full px-1 break-words">
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
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                backfaceVisibility: 'hidden',
              }}
              className={`
                z-10 transition-all duration-300
                ${isSelected ? '' : ''}
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
                  <FontAwesomeIcon icon={faPlay} className="w-6 h-6 text-white ml-0.5" />
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
              <FontAwesomeIcon icon={faSpinner} className="animate-spin w-6 h-6 text-gray-400" />
            </div>
          )}
        </>
      )}

      {/* Selection Checkbox */}
      <div
        className={`
          absolute top-2 start-2 w-3 h-3 z-30
          flex items-center justify-center
          transition-all duration-200
          ${
            isSelected || isHovered ? 'opacity-100' : 'opacity-0'
          }
        `}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(file);
        }}
        style={{
          width: 19,
          height: 19,
          borderRadius: '50%',
          border: isSelected ? '1.5px solid #378ADD' : '1.5px solid rgba(0,0,0,0.22)',
          background: isSelected ? '#378ADD' : 'white',
        }}
      >
        {isSelected && (
          <FontAwesomeIcon 
            icon={faCheck} 
            className="text-white" 
            style={{ width: 10, height: 10 }} 
          />
        )}
      </div>

      {/* Favorite Button */}
      <button
        data-no-select
        className={`
          absolute top-2 end-2 w-7 h-7 rounded-full z-30
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
          <FontAwesomeIcon icon={faSpinner} className="animate-spin w-4 h-4" />
        ) : (
          <FontAwesomeIcon icon={faHeart} className="w-4 h-4" />
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
