import { useState, useEffect } from 'react';
import { useAuth } from '../../context';
import { decryptFilename } from '../../utils/crypto';
import { setDragState, clearDragState } from '../../utils/dragState';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faFolderOpen, faSquareCheck } from '@fortawesome/free-solid-svg-icons';

const FolderCard = ({
  folder,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver = false,
  isSelected = false,
  onSelect,
}) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const [decryptedName, setDecryptedName] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const decrypt = async () => {
      if (!folder?.nameEncrypted || !hasMasterKey()) {
        setDecryptedName(null);
        return;
      }
      try {
        const name = await decryptFilename(folder.nameEncrypted, getMasterKey());
        setDecryptedName(name);
      } catch (err) {
        console.warn('[FolderCard] Failed to decrypt folder name:', err);
        setDecryptedName('Encrypted Folder');
      }
    };
    decrypt();
  }, [folder?.nameEncrypted, getMasterKey, hasMasterKey]);

  const itemCount = (folder.fileCount || 0) + (folder.subfolderCount || 0);

  return (
    <div
      className={`
        relative aspect-square overflow-hidden cursor-pointer
        transition-all duration-200 group
        ${isDragOver
          ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30'
          : isSelected
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-50 dark:ring-offset-zinc-900 bg-gray-100 dark:bg-zinc-800'
          : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700'
        }
      `}
      onClick={(e) => {
        if (isSelected) { onSelect?.(folder); return; }
        onOpen?.(folder);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        setDragState({ type: 'folder', folderId: folder.folderId });
        onDragStart?.(folder);
      }}
      onDragEnd={() => {
        clearDragState();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        onDragOver?.(folder);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop?.(folder);
      }}
    >
      {/* Folder icon + name */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
        <FontAwesomeIcon
          icon={isHovered ? faFolderOpen : faFolder}
          className={`w-16 h-16 mb-2 transition-colors ${
            isDragOver
              ? 'text-blue-500'
              : 'text-amber-400 dark:text-amber-500'
          }`}
        />
        <span className="text-sm font-medium text-gray-900 dark:text-white text-center truncate w-full">
          {decryptedName || 'Loading...'}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Selection checkbox — top-left, visible on hover or when selected */}
      <div
        className={`
          absolute top-2 start-2 w-6 h-6 border-2 z-30
          flex items-center justify-center
          transition-all duration-200
          ${isSelected
            ? 'bg-blue-500 border-blue-500'
            : isHovered
            ? 'bg-black/50 border-white/50'
            : 'opacity-0'
          }
        `}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(folder);
        }}
      >
        {isSelected && (
          <FontAwesomeIcon icon={faSquareCheck} className="w-4 h-4 text-white" />
        )}
      </div>
    </div>
  );
};

export default FolderCard;
