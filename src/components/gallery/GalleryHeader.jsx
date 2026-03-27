import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFolderPlus, 
  faShare, 
  faTrash, 
  faCloudUpload,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

const GalleryHeader = ({
  selectedCount = 0,
  selectedFilesCount = 0,
  selectedFoldersCount = 0,
  onUpload,
  onNewFolder,
  showNewFolder = false,
  onDelete,
  onAddToAlbum,
  onShare,
  onClearSelection,
  storageBar,
  hideUploadOnMobile = false,
}) => {
  const { t } = useTranslation('photos');

  // Build smart label: "3 files", "2 folders", "2 files + 1 folder", etc.
  const selectionLabel = (() => {
    const parts = [];
    if (selectedFilesCount > 0) parts.push(`${selectedFilesCount} file${selectedFilesCount > 1 ? 's' : ''}`);
    if (selectedFoldersCount > 0) parts.push(`${selectedFoldersCount} folder${selectedFoldersCount > 1 ? 's' : ''}`);
    return parts.join(' + ') || `${selectedCount} selected`;
  })();

  // Show Move whenever anything is selected — picker handles both files and folders
  const showMove = selectedCount > 0;
  // Only show Rename if exactly 1 folder selected and no files
  const showShare = selectedCount > 0;

  return (
    <>
      {/* Top bar: storage info + action buttons */}
      <div className="flex items-center justify-between gap-3 mb-2 md:mb-6">
        <div className="flex-1">{storageBar}</div>
        <div className="flex items-center gap-2">
          {showNewFolder && onNewFolder && (
            <button
              onClick={onNewFolder}
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-300 text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faFolderPlus} className="w-4 h-4" />
              <span className="hidden sm:inline">New Folder</span>
            </button>
          )}
        </div>
      </div>

      {/* Floating bottom action bar — slides up when items are selected */}
      <div
        data-no-select
        className={`
          fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-1 px-2 py-2
          bg-zinc-900 dark:bg-zinc-800 text-white
          rounded-2xl shadow-2xl border border-white/10
          transition-all duration-300 ease-out
          ${selectedCount > 0
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-6 pointer-events-none'}
        `}
      >
        {/* Smart count label */}
        <span className="px-3 py-1.5 text-sm font-medium text-zinc-300 whitespace-nowrap border-r border-white/10 mr-1">
          {selectionLabel}
        </span>

        {/* Move to folder — only for files */}
        {showMove && (
          <ActionButton icon={faFolderPlus} label="Move" onClick={onAddToAlbum} color="text-zinc-300 hover:text-zinc-200 hover:bg-zinc-300/20" />
        )}

        {/* Share */}
        {showShare && onShare && (
          <ActionButton icon={faShare} label="Share" onClick={onShare} color="text-zinc-300 hover:text-zinc-200 hover:bg-zinc-300/20" />
        )}

        {/* Delete */}
        <ActionButton icon={faTrash} label="Delete" onClick={onDelete} color="text-zinc-300 hover:text-zinc-200 hover:bg-zinc-300/20" />

        {/* Divider + close */}
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onClearSelection}
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Clear selection"
        >
          <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
        </button>
      </div>
    </>
  );
};

const ActionButton = ({ icon, label, onClick, color }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${color}`}
  >
    <FontAwesomeIcon icon={icon} className="w-4 h-4" />
    <span className="text-[10px] font-medium leading-none">{label}</span>
  </button>
);

export default GalleryHeader;
