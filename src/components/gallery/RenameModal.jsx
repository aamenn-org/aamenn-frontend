import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faXmark, 
  faPen, 
  faSpinner 
} from '@fortawesome/free-solid-svg-icons';

/**
 * Rename Modal Component
 * Allows users to rename files/images with validation
 */
const RenameModal = ({ isOpen, onClose, currentName, onRename, isRenaming, label = 'File' }) => {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && currentName) {
      // Remove file extension for editing
      const nameWithoutExt = currentName.replace(/\.[^/.]+$/, '');
      setNewName(nameWithoutExt);
      setError('');
      // Focus input after modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const trimmedName = newName.trim();
    
    if (!trimmedName) {
      setError('Filename cannot be empty');
      return;
    }

    if (trimmedName.length > 255) {
      setError('Filename is too long (max 255 characters)');
      return;
    }

    // Get original extension
    const extension = currentName.match(/\.[^/.]+$/)?.[0] || '';
    const fullNewName = trimmedName + extension;

    try {
      await onRename(fullNewName);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to rename file');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const extension = currentName?.match(/\.[^/.]+$/)?.[0] || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Rename {label}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            disabled={isRenaming}
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New filename
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter new name"
                disabled={isRenaming}
              />
              {extension && (
                <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {extension}
                </span>
              )}
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              disabled={isRenaming}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={isRenaming || !newName.trim()}
            >
              {isRenaming ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin w-4 h-4" />
                  <span>Renaming...</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faPen} className="w-4 h-4 mr-2" />
                  <span>Rename</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RenameModal;
