import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useTheme } from '../../context';
import { decryptFilename } from '../../utils/crypto';
import { setDragState, clearDragState } from '../../utils/dragState';

// ─── Icon Components ─────────────────────────────────────────────────────
const FolderIcon = ({ color = '#EF9F27', open = false }) => (
  <svg viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
    <rect x="2" y="0" width="14" height="7" rx="3" fill={color} opacity="0.85" />
    <rect x="2" y="5" width="40" height="29" rx="4" fill={color} />
    <rect x="2" y="10" width="40" height="1.5" fill="white" opacity="0.12" />
    {open && <rect x="2" y="5" width="40" height="8" rx="3" fill={color} opacity="0.6" />}
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" style={{ width: 10, height: 10 }}>
    <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" style={{ width: 14, height: 14, flexShrink: 0 }}>
    <polyline points="4,2 9,6 4,10" stroke="var(--color-text-tertiary, #aaa)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── FolderCard ───────────────────────────────────────────────────────────────
const FolderCard = ({
  folder,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver = false,
  isSelected = false,
  onSelect,
  listMode = false,
}) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const { isDarkMode } = useTheme();
  const [decryptedName, setDecryptedName] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const decrypt = async () => {
      if (!folder?.nameEncrypted || !hasMasterKey()) {
        setDecryptedName(null);
        return;
      }
      try {
        const name = await decryptFilename(folder.nameEncrypted, getMasterKey());
        if (!cancelled) setDecryptedName(name);
      } catch {
        if (!cancelled) setDecryptedName('Encrypted Folder');
      }
    };
    decrypt();
    return () => { cancelled = true; };
  }, [folder?.nameEncrypted, getMasterKey, hasMasterKey]);

  const itemCount = useMemo(() => (folder.fileCount || 0) + (folder.subfolderCount || 0), [folder.fileCount, folder.subfolderCount]);
  const displayName = decryptedName ?? 'Loading…';
  const iconColor = isDragOver || isSelected ? '#378ADD' : '#EF9F27';

  const handleClick = useCallback((e) => {
    if (isSelected) { onSelect?.(folder); return; }
    onOpen?.(folder);
  }, [isSelected, folder, onSelect, onOpen]);

  const handleDragStart = useCallback((e) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ type: 'folder', folderId: folder.folderId });
    onDragStart?.(folder);
  }, [folder, onDragStart]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    onDragOver?.(folder);
  }, [folder, onDragOver]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop?.(folder);
  }, [folder, onDrop]);

  const handleSelectClick = useCallback((e) => {
    e.stopPropagation();
    onSelect?.(folder);
  }, [folder, onSelect]);

  const commonProps = useMemo(() => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': `Folder: ${displayName}`,
    'aria-selected': isSelected,
    onClick: handleClick,
    onKeyDown: (e) => e.key === 'Enter' && handleClick(e),
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    draggable: true,
    onDragStart: handleDragStart,
    onDragEnd: clearDragState,
    onDragOver: handleDragOver,
    onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); },
    onDrop: handleDrop,
  }), [displayName, isSelected, handleClick, handleDragStart, handleDragOver, handleDrop]);

  const sharedStyles = useMemo(() => ({
    background: isDragOver ? 'rgba(55,138,221,0.08)' : isSelected ? 'rgba(55,138,221,0.07)' : isHovered ? 'var(--color-background-tertiary, #f0f0ee43)' : 'var(--color-background-secondary, #ffffff0c)',
    border: isDragOver ? '1.5px dashed #378ADD' : isSelected ? '1.5px solid #378ADD' : `0.5px solid ${isDarkMode ? '#ffffff56' : '#00000057'}`,
    transition: 'background 0.14s, border-color 0.14s',
    outline: 'none',
  }), [isDragOver, isSelected, isHovered, isDarkMode]);

  const selectionCheckbox = useMemo(() => (
    <div
      onClick={handleSelectClick}
      aria-label="Select folder"
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: isSelected ? '1.5px solid #378ADD' : '1.5px solid var(--color-border-secondary, rgba(0,0,0,0.22))',
        background: isSelected ? '#378ADD' : 'var(--color-background-primary, white)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isSelected || isHovered ? 1 : 0,
        transition: 'opacity 0.14s, background 0.14s',
      }}
    >
      {isSelected && <CheckIcon />}
    </div>
  ), [isSelected, isHovered, handleSelectClick]);

  // ── LIST / ROW layout (mobile) ──────────────────────────────────────────────
  if (listMode) {
    return (
      <div
        {...commonProps}
        style={{
          ...sharedStyles,
          position: 'relative',
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          cursor: 'pointer',
          borderRadius: 10,
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        {selectionCheckbox}
        <div style={{ flexShrink: 0, width: 36, height: 29 }}>
          <FolderIcon color={iconColor} open={isHovered && !isDragOver} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 30,
            fontWeight: 500,
            color: isDragOver ? '#378ADD' : 'var(--color-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}>
            {displayName}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.3,
            marginTop: 1,
          }}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </div>
        </div>
        <ChevronRightIcon />
      </div>
    );
  }

  // ── GRID / SQUARE layout (tablet + desktop) ─────────────────────────────────
  return (
    <div
      {...commonProps}
      style={{
        ...sharedStyles,
        position: 'relative',
        aspectRatio: '1 / 1',
        cursor: 'pointer',
        borderRadius: 12,
        overflow: 'hidden',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        padding: '12px 10px 10px',
        gap: 2,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 12,
        left: 10,
        width: 44,
        height: 36,
        transition: 'transform 0.14s',
        transform: isHovered && !isDragOver ? 'translateY(-2px)' : 'translateY(0)',
      }}>
        <FolderIcon color={iconColor} open={isHovered && !isDragOver} />
      </div>
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
      }}>
        {selectionCheckbox}
      </div>
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: isDragOver ? '#378ADD' : 'var(--color-text-primary)',
        width: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
      }}>
        {displayName}
      </span>
      <span style={{
        fontSize: 12,
        color: 'var(--color-text-tertiary)',
        lineHeight: 1.2,
      }}>
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </span>
    </div>
  );
};

export default FolderCard;