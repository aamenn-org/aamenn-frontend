import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFolderPlus, 
  faShare, 
  faTrash, 
  faCloudUpload,
  faCheck
} from '@fortawesome/free-solid-svg-icons';

const GalleryHeader = ({
  selectedCount = 0,
  onUpload,
  onDelete,
  onAddToAlbum,
  onShare,
  storageBar,
  hideUploadOnMobile = false,
}) => {
  const { t } = useTranslation('photos');
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-2 md:mb-6">
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        {selectedCount > 0 && (
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {t('selected', '{{count}} selected', { count: selectedCount })}
          </span>
        )}
        {/* Storage Bar - inline */}
        {storageBar}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto overflow-x-auto scrollbar-hide pb-1">
        {/* Add to Folder Button (visible when items selected) */}
        {selectedCount > 0 && (
          <button
            onClick={onAddToAlbum}
            className="inline-flex items-center px-2 py-1.5 sm:px-4 sm:py-2 bg-purple-500 text-white text-xs sm:text-sm font-medium hover:bg-purple-600 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <FontAwesomeIcon icon={faFolderPlus} className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">Add to Folder</span>
          </button>
        )}

        {/* Share Button (visible when items selected) */}
        {selectedCount > 0 && onShare && (
          <button
            onClick={() => {
              console.log('Share button clicked in GalleryHeader');
              onShare();
            }}
            className="inline-flex items-center px-2 py-1.5 sm:px-4 sm:py-2 bg-green-500 text-white text-xs sm:text-sm font-medium hover:bg-green-600 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <FontAwesomeIcon icon={faShare} className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('share', 'Share')}</span>
          </button>
        )}

        {/* Delete Button (visible when items selected) */}
        {selectedCount > 0 && (
          <button
            onClick={onDelete}
            className="inline-flex items-center px-2 py-1.5 sm:px-4 sm:py-2 bg-red-500 text-white text-xs sm:text-sm font-medium hover:bg-red-600 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <FontAwesomeIcon icon={faTrash} className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('delete', 'Delete')}</span>
          </button>
        )}

        {/* Upload Button */}
        {!hideUploadOnMobile && (
          <button
            onClick={onUpload}
            className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-500 text-white text-xs sm:text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <FontAwesomeIcon icon={faCloudUpload} className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            {t('uploadFiles', 'Upload')}
          </button>
        )}
      </div>
    </div>
  );
};

export default GalleryHeader;
