import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFolderPlus, 
  faShare, 
  faTrash, 
  faCloudUpload
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
        {storageBar}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        {/* Desktop: Full buttons */}
        <div className="hidden sm:flex items-center gap-2">
          {selectedCount > 0 && (
            <button
              onClick={onAddToAlbum}
              className="inline-flex items-center px-4 py-2 bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faFolderPlus} className="w-4 h-4 mr-2" />
              Add to Folder
            </button>
          )}

          {selectedCount > 0 && onShare && (
            <button
              onClick={onShare}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faShare} className="w-4 h-4 mr-2" />
              {t('share', 'Share')}
            </button>
          )}

          {selectedCount > 0 && (
            <button
              onClick={onDelete}
              className="inline-flex items-center px-4 py-2 bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faTrash} className="w-4 h-4 mr-2" />
              {t('delete', 'Delete')}
            </button>
          )}

          {!hideUploadOnMobile && (
            <button
              onClick={onUpload}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faCloudUpload} className="w-4 h-4 mr-2" />
              {t('uploadFiles', 'Upload')}
            </button>
          )}
        </div>

        {/* Mobile: Icon-only buttons + Dropdown for selected actions */}
        <div className="flex sm:hidden items-center gap-2 w-full justify-end">
          {selectedCount > 0 && (
            <>
              {/* Icon-only Add to Folder */}
              <button
                onClick={onAddToAlbum}
                className="p-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                aria-label="Add to Folder"
              >
                <FontAwesomeIcon icon={faFolderPlus} className="w-4 h-4" />
              </button>

              {/* Icon-only Share */}
              {onShare && (
                <button
                  onClick={onShare}
                  className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  aria-label={t('share', 'Share')}
                >
                  <FontAwesomeIcon icon={faShare} className="w-4 h-4" />
                </button>
              )}

              {/* Icon-only Delete */}
              <button
                onClick={onDelete}
                className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                aria-label={t('delete', 'Delete')}
              >
                <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
              </button>
            </>
          )}

          {!hideUploadOnMobile && (
            <button
              onClick={onUpload}
              className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              aria-label={t('uploadFiles', 'Upload')}
            >
              <FontAwesomeIcon icon={faCloudUpload} className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GalleryHeader;
