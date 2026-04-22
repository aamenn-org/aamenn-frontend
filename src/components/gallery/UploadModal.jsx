import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faXmark,
  faCloudUpload,
  faTrash,
  faFileVideo,
  faFilePdf,
  faFileWord,
  faFileLines,
  faFile,
  faImage,
  faCircleExclamation,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';

// ─── Pure helpers (no component state) ──────────────────────────────────────

function isAcceptedType(file) {
  return !!file.name;
}

// Stable identity key for a File object — avoids using object reference as Map key
// so the same logical file stays consistent across renders even after deduplication.
function stableFileKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return faImage;
  if (mimeType.startsWith('video/')) return faFileVideo;
  if (mimeType === 'application/pdf') return faFilePdf;
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return faFileWord;
  if (mimeType.startsWith('text/')) return faFileLines;
  return faFile;
}

// ─── Component ───────────────────────────────────────────────────────────────

const UploadModal = ({ isOpen, onClose, onUpload }) => {
  const { t } = useTranslation('photos');

  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState(new Map());
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  // Tracks temp object URLs created during canvas thumbnail generation so they can be
  // revoked if the component unmounts or the modal closes before the image finishes loading.
  const pendingPreviewUrlsRef = useRef(new Map());

  // ─── Cleanup when modal closes ─────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) return;
    pendingPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    pendingPreviewUrlsRef.current.clear();
    setFiles([]);
    setPreviews(new Map());
    setQueuing(false);
    setError(null);
    setIsDragging(false);
  }, [isOpen]);

  // ─── Final unmount safety net ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      pendingPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      pendingPreviewUrlsRef.current.clear();
    };
  }, []);

  // ─── Thumbnail generation (images only) ───────────────────────────────────
  const generatePreview = useCallback((file, key) => {
    if (!file.type.startsWith('image/')) return;
    const tempUrl = URL.createObjectURL(file);
    pendingPreviewUrlsRef.current.set(key, tempUrl);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      pendingPreviewUrlsRef.current.delete(key);
      const MAX = 80;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale) || 1;
      canvas.height = Math.round(img.height * scale) || 1;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      setPreviews((prev) => new Map(prev).set(key, dataUrl));
    };
    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      pendingPreviewUrlsRef.current.delete(key);
    };
    img.src = tempUrl;
  }, []);

  // ─── Add files (deduplicated, filtered, no empty files) ───────────────────
  const addFiles = useCallback(
    (incoming) => {
      const accepted = incoming.filter(isAcceptedType);
      if (accepted.length === 0) return;

      setFiles((prev) => {
        const existingKeys = new Set(prev.map(stableFileKey));
        const deduped = accepted.filter(
          (f) => f.size > 0 && !existingKeys.has(stableFileKey(f)),
        );
        deduped.forEach((f) => generatePreview(f, stableFileKey(f)));
        return [...prev, ...deduped];
      });
      setError(null);
    },
    [generatePreview],
  );

  // ─── Event handlers ────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleFileSelect = useCallback(
    (e) => {
      addFiles(Array.from(e.target.files));
      // Reset so the same file can be re-selected after being removed from the list
      e.target.value = '';
    },
    [addFiles],
  );

  const removeFile = useCallback((key) => {
    setFiles((prev) => prev.filter((f) => stableFileKey(f) !== key));
    setPreviews((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // ─── Upload (queues files; real progress is in UploadProgressPanel) ────────
  const handleUpload = useCallback(async () => {
    if (files.length === 0 || queuing) return;
    setQueuing(true);
    setError(null);
    try {
      await onUpload(files);
      // Files are now queued in useUpload. Close the modal — the isOpen→false effect
      // handles state reset. Actual encryption + upload progress is shown by UploadProgressPanel.
      onClose();
    } catch (err) {
      setError(
        err?.message || t('upload.error', 'Upload failed. Please try again.'),
      );
      setQueuing(false);
    }
  }, [files, queuing, onUpload, onClose, t]);

  // ─── Early return (all hooks are unconditionally above this line) ──────────
  if (!isOpen) return null;

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop — blocked during queuing to prevent accidental close */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={!queuing ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('uploadFiles', 'Upload Files')}
          </h2>
          <button
            onClick={onClose}
            disabled={queuing}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <FontAwesomeIcon
              icon={faXmark}
              className="w-5 h-5 text-gray-500 dark:text-gray-400"
            />
          </button>
        </div>

        {/* Drop Zone */}
        <div
          className={`
            border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
            ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-zinc-600 hover:border-gray-300 dark:hover:border-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-700/50'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon
              icon={faCloudUpload}
              className="w-6 h-6 text-blue-500"
            />
          </div>
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            {t(
              'upload.dragDrop',
              'Drag and drop your files here, or click to browse',
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t(
              'upload.supported',
              'All file types supported · Images & videos include previews',
            )}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Inline error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="w-4 h-4 shrink-0"
            />
            <span>{error}</span>
          </div>
        )}

        {/* Selected files list */}
        {files.length > 0 && (
          <div className="mt-4 max-h-48 overflow-y-auto space-y-2">
            {files.map((file) => {
              const key = stableFileKey(file);
              const preview = previews.get(key);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-zinc-700 rounded-lg"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-zinc-600 rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                      {preview ? (
                        <img
                          src={preview}
                          alt={file.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FontAwesomeIcon
                          icon={getFileIcon(file.type)}
                          className="w-5 h-5 text-gray-400 dark:text-gray-500"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(key)}
                    disabled={queuing}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-600 rounded transition-colors ml-2 flex-shrink-0 disabled:opacity-50"
                  >
                    <FontAwesomeIcon
                      icon={faTrash}
                      className="w-4 h-4 text-gray-500 dark:text-gray-400"
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Total size summary (only meaningful when multiple files selected) */}
        {files.length > 1 && (
          <p className="mt-2 text-xs text-right text-gray-500 dark:text-gray-400">
            {t('upload.totalSize', 'Total: {{size}}', {
              size: formatBytes(totalSize),
            })}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            disabled={queuing}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || queuing}
            className="px-4 py-2 bg-blue-500 text-white font-medium hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {queuing && (
              <FontAwesomeIcon
                icon={faSpinner}
                className="w-4 h-4 animate-spin"
              />
            )}
            {queuing
              ? t('upload.queuing', 'Adding...')
              : t('upload.uploadFiles', 'Upload {{count}} file', {
                  count: files.length,
                })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
