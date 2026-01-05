const GalleryHeader = ({
  selectedCount = 0,
  onUpload,
  onDelete,
  onAddToAlbum,
  storageBar,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {selectedCount > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {selectedCount} selected
          </span>
        )}
        {/* Storage Bar - inline */}
        {storageBar}
      </div>

      <div className="flex items-center space-x-3">
        {/* Add to Album Button (visible when items selected) */}
        {selectedCount > 0 && (
          <button
            onClick={onAddToAlbum}
            className="inline-flex items-center px-4 py-2 bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
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
            Add to Album
          </button>
        )}

        {/* Delete Button (visible when items selected) */}
        {selectedCount > 0 && (
          <button
            onClick={onDelete}
            className="inline-flex items-center px-4 py-2 bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
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
            Delete
          </button>
        )}

        {/* Upload Button */}
        <button
          onClick={onUpload}
          className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          <svg
            className="w-4 h-4 mr-2"
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
          Upload
        </button>
      </div>
    </div>
  );
};

export default GalleryHeader;
