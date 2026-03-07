import { useTranslation } from 'react-i18next';

const GalleryHeader = ({
  selectedCount = 0,
  onUpload,
  onDelete,
  onAddToAlbum,
  onShare,
  storageBar,
}) => {
  const { t } = useTranslation('photos');
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 md:mb-6">
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
        {/* Add to Album Button (visible when items selected) */}
        {selectedCount > 0 && (
          <button
            onClick={onAddToAlbum}
            className="inline-flex items-center px-2 py-1.5 sm:px-4 sm:py-2 bg-purple-500 text-white text-xs sm:text-sm font-medium hover:bg-purple-600 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="hidden sm:inline">{t('addToAlbum', 'Add to Album')}</span>
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
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span className="hidden sm:inline">{t('share', 'Share')}</span>
          </button>
        )}

        {/* Delete Button (visible when items selected) */}
        {selectedCount > 0 && (
          <button
            onClick={onDelete}
            className="inline-flex items-center px-2 py-1.5 sm:px-4 sm:py-2 bg-red-500 text-white text-xs sm:text-sm font-medium hover:bg-red-600 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span className="hidden sm:inline">{t('delete', 'Delete')}</span>
          </button>
        )}

        {/* Upload Button */}
        <button
          onClick={onUpload}
          className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-500 text-white text-xs sm:text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap flex-shrink-0"
        >
          <svg
            className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          {t('uploadFiles', 'Upload')}
        </button>
      </div>
    </div>
  );
};

export default GalleryHeader;
