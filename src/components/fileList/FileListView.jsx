import { useState, useEffect, useRef, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFolder } from '@fortawesome/free-solid-svg-icons';
import { getTypeLabel } from '../../utils/format';
import useDecryptedNames from '../../hooks/useDecryptedNames';
import FileListHeader from './FileListHeader';
import FileListRow from './FileListRow';

const sortItems = (folders, files, sortKey, sortDir) => {
  const dir = sortDir === 'asc' ? 1 : -1;

  const sortedFolders = [...folders].sort((a, b) => {
    if (sortKey === 'name') {
      const na = (a.decryptedName || a.nameEncrypted || '').toLowerCase();
      const nb = (b.decryptedName || b.nameEncrypted || '').toLowerCase();
      return na.localeCompare(nb) * dir;
    }
    if (sortKey === 'modified') {
      return (new Date(a.updatedAt) - new Date(b.updatedAt)) * dir;
    }
    // size — folders use item count
    const ca = (a.fileCount || 0) + (a.subfolderCount || 0);
    const cb = (b.fileCount || 0) + (b.subfolderCount || 0);
    return (ca - cb) * dir;
  });

  const sortedFiles = [...files].sort((a, b) => {
    if (sortKey === 'name') {
      const na = (a.decryptedName || a.fileNameEncrypted || '').toLowerCase();
      const nb = (b.decryptedName || b.fileNameEncrypted || '').toLowerCase();
      return na.localeCompare(nb) * dir;
    }
    if (sortKey === 'size') {
      return ((a.sizeBytes || 0) - (b.sizeBytes || 0)) * dir;
    }
    if (sortKey === 'modified') {
      return (new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt)) * dir;
    }
    if (sortKey === 'type') {
      const ta = getTypeLabel(a.mimeType);
      const tb = getTypeLabel(b.mimeType);
      const cmp = ta.localeCompare(tb);
      if (cmp !== 0) return cmp * dir;
      // Within same type, sort by name asc
      const na = (a.decryptedName || a.fileNameEncrypted || '').toLowerCase();
      const nb = (b.decryptedName || b.fileNameEncrypted || '').toLowerCase();
      return na.localeCompare(nb);
    }
    return 0;
  });

  return { sortedFolders, sortedFiles };
};

const FileListView = ({
  // Data
  folders = [],
  files = [],
  // Search
  searchQuery = '',
  // Selection
  selectedFiles = [],
  selectedFolders = [],
  onSelectFile,
  onSelectFolder,
  // Actions
  onViewFile,
  onOpenFolder,
  onFavoriteToggle,
  // Drag & drop
  onDropOnFolder,
  dragOverFolderId,
  onFolderDragOver,
  // Loading / pagination
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  // Empty state
  emptyMessage = 'This folder is empty',
  emptyIcon = faFolder,
}) => {
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const loadMoreRef = useRef(null);

  // Batch-decrypt all names (cached — each name only decrypted once)
  const fileNamesMap = useDecryptedNames(files, false);
  const folderNamesMap = useDecryptedNames(folders, true);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Apply search filter using decrypted names
  const query = searchQuery.toLowerCase().trim();
  const filteredFiles = query
    ? files.filter((f) => {
        const id = f.fileId || f.id;
        const name = fileNamesMap.get(id) || '';
        return name.toLowerCase().includes(query);
      })
    : files;
  const filteredFolders = query
    ? folders.filter((f) => {
        const name = folderNamesMap.get(f.folderId) || '';
        return name.toLowerCase().includes(query);
      })
    : folders;

  const { sortedFolders, sortedFiles } = useMemo(
    () => sortItems(filteredFolders, filteredFiles, sortKey, sortDir),
    [filteredFolders, filteredFiles, sortKey, sortDir]
  );

  const isEmpty = sortedFolders.length === 0 && sortedFiles.length === 0 && !loading;

  // Infinite scroll sentinel
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          onLoadMore?.();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, onLoadMore]);

  if (loading && sortedFolders.length === 0 && sortedFiles.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <FileListHeader sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        <div className="flex-1 flex items-center justify-center py-20">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin w-6 h-6 text-gray-400" />
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col h-full">
        <FileListHeader sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
            <FontAwesomeIcon icon={emptyIcon} className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FileListHeader sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />

      <div className="flex-1 overflow-y-auto">
        {/* Folders first */}
        {sortedFolders.map((folder) => (
          <FileListRow
            key={folder.folderId}
            item={folder}
            isFolder
            decryptedName={folderNamesMap.get(folder.folderId)}
            isSelected={selectedFolders.includes(folder.folderId)}
            onSelect={onSelectFolder}
            onClick={(f) => onOpenFolder?.(f.folderId)}
            isDragOver={dragOverFolderId === folder.folderId}
            onDragOver={() => onFolderDragOver?.(folder.folderId)}
            onDrop={onDropOnFolder}
          />
        ))}

        {/* Files */}
        {sortedFiles.map((file) => {
          const fileId = file.fileId || file.id;
          return (
            <FileListRow
              key={fileId}
              item={file}
              isFolder={false}
              decryptedName={fileNamesMap.get(fileId)}
              isSelected={selectedFiles.includes(fileId)}
              onSelect={onSelectFile}
              onClick={onViewFile}
              onFavoriteToggle={onFavoriteToggle}
              selectedFileIds={selectedFiles}
            />
          );
        })}

        {/* Infinite scroll sentinel */}
        <div ref={loadMoreRef} className="flex justify-center py-4">
          {loadingMore && (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin w-4 h-4" />
              <span>Loading more…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileListView;
