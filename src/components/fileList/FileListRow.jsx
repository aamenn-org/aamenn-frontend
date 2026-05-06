import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context';
import { decryptFilename } from '../../utils/crypto';
import { getFileType, FILE_HANDLERS, isVideo } from '../../utils/thumbnail';
import { thumbnailCache } from '../../services/cache/thumbnail-cache';
import { formatFileSize, formatDate, getTypeLabel } from '../../utils/format';
import { setDragState } from '../../utils/dragState';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolder,
  faFile,
  faFilePdf,
  faFileWord,
  faFileLines,
  faFileExcel,
  faFileZipper,
  faImage,
  faVideo,
  faMusic,
  faCheck,
  faHeart,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { fileService } from '../../services';

// ─── Folder icon (svg, coloured) ─────────────────────────────────────────────
const FolderIconSvg = ({ color = '#EF9F27', size = 20 }) => (
  <svg viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size * 0.82 }}>
    <rect x="2" y="0" width="14" height="7" rx="3" fill={color} opacity="0.85" />
    <rect x="2" y="5" width="40" height="29" rx="4" fill={color} />
    <rect x="2" y="10" width="40" height="1.5" fill="white" opacity="0.12" />
  </svg>
);

// ─── File icon helper ─────────────────────────────────────────────────────────
const getFileIconInfo = (mimeType) => {
  if (!mimeType) return { icon: faFile, color: 'text-gray-400' };
  if (mimeType.startsWith('image/')) return { icon: faImage, color: 'text-green-500' };
  if (mimeType.startsWith('video/')) return { icon: faVideo, color: 'text-purple-500' };
  if (mimeType.startsWith('audio/')) return { icon: faMusic, color: 'text-pink-500' };
  if (mimeType.includes('pdf')) return { icon: faFilePdf, color: 'text-red-500' };
  if (mimeType.includes('word') || mimeType.includes('docx')) return { icon: faFileWord, color: 'text-blue-500' };
  if (mimeType.includes('excel') || mimeType.includes('xlsx') || mimeType.includes('spreadsheet')) return { icon: faFileExcel, color: 'text-green-600' };
  if (mimeType.includes('text')) return { icon: faFileLines, color: 'text-gray-500' };
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return { icon: faFileZipper, color: 'text-amber-500' };
  return { icon: faFile, color: 'text-gray-400' };
};

// ─── FileListRow ─────────────────────────────────────────────────────────────
const FileListRow = ({
  item,
  isFolder = false,
  decryptedName: decryptedNameProp = null,
  isSelected = false,
  onSelect,
  onClick,
  onFavoriteToggle,
  selectedFileIds = [],
  isDragOver = false,
  onDragOver,
  onDrop,
  onContextMenu,
}) => {
  const { getMasterKey, getMasterKeyBytes, hasMasterKey } = useAuth();
  const [decryptedNameLocal, setDecryptedNameLocal] = useState(null);
  const decryptedName = decryptedNameProp ?? decryptedNameLocal;
  const [isHovered, setIsHovered] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [isFavorite, setIsFavorite] = useState(item.isFavorite || false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const abortRef = useRef(null);
  const rowRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasBeenVisibleRef = useRef(false);

  const itemId = isFolder ? item.folderId : (item.fileId || item.id);
  const mimeType = item.mimeType;
  const fileType = isFolder ? 'folder' : getFileType(mimeType);
  const handler = !isFolder ? FILE_HANDLERS[fileType] : null;
  const hasThumb = !isFolder && handler?.hasThumbnails && item.thumbSmallUrl && hasMasterKey() && item.cipherFileKey;

  // Decrypt name locally only when not supplied by parent
  useEffect(() => {
    if (decryptedNameProp !== null) return; // parent already provided it
    let cancelled = false;
    const decrypt = async () => {
      const encKey = isFolder ? item.nameEncrypted : item.fileNameEncrypted;
      if (!encKey || !hasMasterKey()) { setDecryptedNameLocal(null); return; }
      try {
        const name = await decryptFilename(encKey, getMasterKey());
        if (!cancelled) setDecryptedNameLocal(name);
      } catch {
        if (!cancelled) setDecryptedNameLocal(isFolder ? 'Encrypted Folder' : 'Encrypted File');
      }
    };
    decrypt();
    return () => { cancelled = true; };
  }, [decryptedNameProp, isFolder ? item.nameEncrypted : item.fileNameEncrypted, getMasterKey, hasMasterKey]);

  // Update favorite state
  useEffect(() => { setIsFavorite(item.isFavorite || false); }, [item.isFavorite]);

  // IntersectionObserver — detect when row enters/leaves viewport
  useEffect(() => {
    if (!rowRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const nowVisible = entries[0].isIntersecting;
        setIsVisible(nowVisible);
        if (nowVisible) hasBeenVisibleRef.current = true;
      },
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, []);

  // Load small thumbnail once the row has been visible
  useEffect(() => {
    if (!hasThumb || !hasBeenVisibleRef.current) return;
    if (thumbnailUrl) return;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const load = async () => {
      try {
        const masterKey = getMasterKey();
        const masterKeyBytes = getMasterKeyBytes?.();
        const url = await thumbnailCache.getThumbnailWithPriority(
          item.fileId,
          item.thumbSmallUrl,
          masterKey,
          item.cipherFileKey,
          { priority: isVisible ? 'high' : 'normal', signal: ctrl.signal, masterKeyBytes }
        );
        if (!ctrl.signal.aborted) setThumbnailUrl(url);
      } catch { /* ignore abort */ }
    };
    load();
    return () => ctrl.abort();
  }, [isVisible, hasThumb]);

  const displayName = decryptedName ?? '…';

  const handleClick = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      onSelect?.(item);
      return;
    }
    onClick?.(item);
  };

  const handleSelectClick = (e) => {
    e.stopPropagation();
    onSelect?.(item);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(item, e, isFolder ? 'folder' : 'file');
  };

  const handleFavorite = async (e) => {
    e.stopPropagation();
    if (favoriteLoading || isFolder) return;
    setFavoriteLoading(true);
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      await fileService.updateFile(item.fileId, { isFavorite: next });
      onFavoriteToggle?.(item.fileId, next);
    } catch {
      setIsFavorite(!next);
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    if (isFolder) {
      setDragState({ type: 'folder', folderId: item.folderId });
    } else {
      const fileId = item.fileId || item.id;
      const ids = selectedFileIds.includes(fileId) && selectedFileIds.length > 1
        ? selectedFileIds : [fileId];
      setDragState({ type: 'files', fileIds: ids });
    }
  };

  const rowBg = isDragOver
    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400'
    : isSelected
    ? 'bg-blue-50/70 dark:bg-blue-900/15'
    : isHovered
    ? 'bg-gray-50 dark:bg-zinc-700/40'
    : '';

  const { icon: fileIcon, color: fileIconColor } = !isFolder ? getFileIconInfo(mimeType) : { icon: faFolder, color: '' };

  return (
    <div
      ref={rowRef}
      role="row"
      aria-selected={isSelected}
      data-select-id={isFolder ? `folder:${itemId}` : `file:${itemId}`}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-gray-100 dark:border-zinc-700/50 select-none transition-colors ${rowBg}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver?.(item); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop?.(item); }}
    >
      {/* Checkbox */}
      <div
        className="w-5 h-5 flex-shrink-0 flex items-center justify-center"
        onClick={handleSelectClick}
        style={{
          borderRadius: '50%',
          border: isSelected ? '1.5px solid #378ADD' : '1.5px solid rgba(0,0,0,0.22)',
          background: isSelected ? '#378ADD' : 'transparent',
          opacity: isSelected || isHovered ? 1 : 0,
          transition: 'opacity 0.12s',
          flexShrink: 0,
        }}
      >
        {isSelected && <FontAwesomeIcon icon={faCheck} className="text-white" style={{ width: 9, height: 9 }} />}
      </div>

      {/* Icon / Thumbnail */}
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center overflow-hidden rounded-sm">
        {isFolder ? (
          <FolderIconSvg color={isSelected || isDragOver ? '#378ADD' : '#EF9F27'} size={22} />
        ) : thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover rounded-sm" />
        ) : (
          <FontAwesomeIcon icon={fileIcon} className={`text-base ${fileIconColor}`} />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={`text-sm truncate font-medium ${
            isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {displayName}
        </span>
      </div>

      {/* Favorite button (files only, appears on hover) */}
      {!isFolder && (
        <button
          data-no-select
          onClick={handleFavorite}
          className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-all ${
            isFavorite ? 'text-red-500 opacity-100' : isHovered ? 'text-gray-400 hover:text-red-400 opacity-80' : 'opacity-0'
          }`}
        >
          {favoriteLoading
            ? <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
            : <FontAwesomeIcon icon={faHeart} className="text-xs" />}
        </button>
      )}

      {/* Type */}
      <div className="w-28 flex-shrink-0 hidden md:block">
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {isFolder ? 'Folder' : getTypeLabel(mimeType)}
        </span>
      </div>

      {/* Size */}
      <div className="w-24 flex-shrink-0 text-right hidden sm:block">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {isFolder ? (
            (() => {
              const count = (item.fileCount || 0) + (item.subfolderCount || 0);
              return `${count} ${count === 1 ? 'item' : 'items'}`;
            })()
          ) : formatFileSize(item.sizeBytes)}
        </span>
      </div>

      {/* Modified date */}
      <div className="w-40 flex-shrink-0 text-right hidden md:block">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(item.updatedAt || item.createdAt)}
        </span>
      </div>
    </div>
  );
};

export default FileListRow;
