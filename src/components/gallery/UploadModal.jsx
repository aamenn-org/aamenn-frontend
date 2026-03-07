import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const UploadModal = ({ isOpen, onClose, onUpload }) => {
  const { t } = useTranslation('photos');
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

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
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
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
            <svg
              className="w-5 h-5 text-gray-500 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
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
            <svg
              className="w-6 h-6 text-blue-500"
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
                      src={URL.createObjectURL(file)}
                      alt={file.name}
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
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
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
