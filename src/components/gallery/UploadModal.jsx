import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faXmark, 
  faCloudUpload, 
  faTrash 
} from '@fortawesome/free-solid-svg-icons';

const UploadModal = ({ isOpen, onClose, onUpload }) => {
  const { t } = useTranslation('photos');
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef(new Map());
  const [previews, setPreviews] = useState(new Map());
  
// Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  const getObjectUrl = useCallback((file) => {
    if (!objectUrlsRef.current.has(file)) {
      objectUrlsRef.current.set(file, URL.createObjectURL(file));
    }
    return objectUrlsRef.current.get(file);
  }, []);

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) =>
        file.type.startsWith('image/') ||
        file.type.startsWith('video/') ||
        file.type === 'application/pdf' ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type.startsWith('text/')
    );
    setFiles((prev) => [...prev, ...droppedFiles]);
    generatePreviews(droppedFiles);
  };

const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selectedFiles]);
    generatePreviews(selectedFiles);
  };

const removeFile = (index) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (objectUrlsRef.current.has(removed)) {
        URL.revokeObjectURL(objectUrlsRef.current.get(removed));
        objectUrlsRef.current.delete(removed);
      }
      setPreviews((p) => {
        const next = new Map(p);
        next.delete(removed);
        return next;
      });
      return prev.filter((_, i) => i !== index);
    });
  };

const generatePreviews = (newFiles) => {
    newFiles.forEach((file) => {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
      const tempUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(tempUrl);
        const MAX = 80;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPreviews((prev) => new Map(prev).set(file, dataUrl));
      };
      img.onerror = () => URL.revokeObjectURL(tempUrl);
      img.src = tempUrl;
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    try {
      await onUpload(files, (progress) => setProgress(progress));
      setFiles([]);
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('uploadFiles', 'Upload Files')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5 text-gray-500 dark:text-gray-400" />
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
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faCloudUpload} className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            {t('upload.dragDrop', 'Drag and drop your files here, or click to browse')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('upload.supported', 'Supported: Images, Videos, PDF, DOCX, TXT')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.docx,.txt,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="mt-4 max-h-40 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-zinc-700 mb-2"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-zinc-600 overflow-hidden">
<img
                    src={previews.get(file) || getObjectUrl(file)}
                    alt={file.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-600"
                >
                  <FontAwesomeIcon icon={faTrash} className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-300">{t('upload.encrypting', 'Encrypting and uploading...')}</span>
              <span className="text-gray-900 dark:text-white font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-zinc-700 h-2">
              <div
                className="bg-blue-500 h-2 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="px-4 py-2 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading
              ? t('upload.uploading', 'Uploading...')
              : t('upload.uploadFiles', 'Upload {{count}} file', { count: files.length })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
