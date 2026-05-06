import { useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolderPlus,
  faPen,
  faShare,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

const GalleryContextMenu = ({
  x,
  y,
  selectedCount = 0,
  selectedFilesCount = 0,
  selectedFoldersCount = 0,
  onMove,
  onRename,
  onShare,
  onDelete,
  onClose,
}) => {
  useEffect(() => {
    const handlePointerDown = () => onClose?.();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const selectionLabel = useMemo(() => {
    const parts = [];
    if (selectedFilesCount > 0) {
      parts.push(`${selectedFilesCount} file${selectedFilesCount > 1 ? 's' : ''}`);
    }
    if (selectedFoldersCount > 0) {
      parts.push(`${selectedFoldersCount} folder${selectedFoldersCount > 1 ? 's' : ''}`);
    }
    return parts.join(' + ') || `${selectedCount} selected`;
  }, [selectedCount, selectedFilesCount, selectedFoldersCount]);

  const menuStyle = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 260),
  };

  const runAction = (action) => (e) => {
    e.stopPropagation();
    action?.();
    onClose?.();
  };

  return (
    <div
      data-no-select
      className="fixed z-[80] w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1.5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-800"
      style={menuStyle}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <div className="px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {selectionLabel}
      </div>
      <div className="h-px bg-zinc-100 dark:bg-zinc-700" />
      <ContextMenuItem icon={faFolderPlus} label="Move" onClick={runAction(onMove)} />
      {selectedCount === 1 && onRename && (
        <ContextMenuItem icon={faPen} label="Rename" onClick={runAction(onRename)} />
      )}
      {onShare && <ContextMenuItem icon={faShare} label="Share" onClick={runAction(onShare)} />}
      <div className="h-px bg-zinc-100 dark:bg-zinc-700" />
      <ContextMenuItem icon={faTrash} label="Delete" danger onClick={runAction(onDelete)} />
      {/* <ContextMenuItem icon={faXmark} label="Close menu" onClick={runAction(onClose)} muted /> */}
    </div>
  );
};

const ContextMenuItem = ({ icon, label, onClick, danger = false, muted = false }) => (
  <button
    type="button"
    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
      danger
        ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
        : muted
          ? 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700'
          : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700'
    }`}
    onClick={onClick}
    role="menuitem"
  >
    <FontAwesomeIcon icon={icon} className="h-4 w-4" />
    <span>{label}</span>
  </button>
);

export default GalleryContextMenu;
