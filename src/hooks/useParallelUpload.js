/**
 * useParallelUpload Hook
 *
 * React hook for managing parallel file uploads with encryption.
 * Provides a clean interface for the UI to interact with the upload system.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getUploadManager, UploadState } from '../services/parallel-upload';
import { useAuth } from '../context';

const initialStats = {
  total: 0,
  queued: 0,
  active: 0,
  completed: 0,
  failed: 0,
  overallProgress: 0,
  paused: false,
  activeTasks: [],
};

export function useParallelUpload() {
  const { getMasterKey, masterKeyAvailable } = useAuth();
  const [stats, setStats] = useState(initialStats);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const managerRef = useRef(null);
  const listenerRef = useRef(null);

  // Initialize upload manager when master key is available
  const initialize = useCallback(async () => {
    if (isInitialized) return true;

    const masterKey = getMasterKey();
    if (!masterKey) {
      setError('Master key not available. Please unlock your vault.');
      return false;
    }

    try {
      const manager = getUploadManager();

      // Check if manager is already initialized (e.g., after page refresh)
      if (!manager.initialized) {
        await manager.init(masterKey);
      }

      managerRef.current = manager;

      // Get current stats immediately (important for page refresh scenario)
      const currentStats = manager.getStats();
      if (currentStats.total > 0) {
        setStats(currentStats);
        if (currentStats.active > 0 || currentStats.queued > 0) {
          setIsUploading(true);
        }
      }

      // Set up event listener
      listenerRef.current = manager.addListener((event, data, newStats) => {
        console.log('[useParallelUpload] Event:', event, 'Stats:', newStats);
        setStats(newStats);

        // Update uploading state
        if (newStats.active > 0 || newStats.queued > 0) {
          setIsUploading(true);
        } else {
          setIsUploading(false);
        }

        // Handle specific events
        switch (event) {
          case 'taskFailed':
            console.error('[useParallelUpload] Upload failed:', data.error);
            break;
          case 'taskCompleted':
            console.log(
              '[useParallelUpload] Upload completed:',
              data.file?.name
            );
            break;
        }
      });

      setIsInitialized(true);
      setError(null);
      return true;
    } catch (err) {
      console.error('[useParallelUpload] Initialization failed:', err);
      setError(err.message);
      return false;
    }
  }, [getMasterKey, isInitialized]);

  // Auto-initialize when master key becomes available
  useEffect(() => {
    let mounted = true;

    if (masterKeyAvailable && !isInitialized) {
      // Use requestAnimationFrame to avoid synchronous setState in effect
      requestAnimationFrame(() => {
        if (mounted) {
          initialize();
        }
      });
    }

    return () => {
      mounted = false;
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, [masterKeyAvailable, isInitialized, initialize]);

  // Upload files
  const uploadFiles = useCallback(
    async (files, options = {}) => {
      // Ensure initialized
      if (!isInitialized) {
        const success = await initialize();
        if (!success) {
          throw new Error('Failed to initialize upload manager');
        }
      }

      const manager = managerRef.current;
      if (!manager) {
        throw new Error('Upload manager not available');
      }

      try {
        setError(null);
        const taskIds = await manager.uploadFiles(files, options);
        return taskIds;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [isInitialized, initialize]
  );

  // Cancel specific upload
  const cancelUpload = useCallback((taskId) => {
    const manager = managerRef.current;
    if (manager) {
      return manager.cancelUpload(taskId);
    }
    return false;
  }, []);

  // Cancel all uploads
  const cancelAll = useCallback(() => {
    const manager = managerRef.current;
    if (manager) {
      manager.cancelAll();
    }
  }, []);

  // Pause uploads
  const pause = useCallback(() => {
    const manager = managerRef.current;
    if (manager) {
      manager.pause();
    }
  }, []);

  // Resume uploads
  const resume = useCallback(() => {
    const manager = managerRef.current;
    if (manager) {
      manager.resume();
    }
  }, []);

  // Retry failed uploads
  const retryFailed = useCallback(() => {
    const manager = managerRef.current;
    if (manager) {
      manager.retryFailed();
    }
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    const manager = managerRef.current;
    if (manager) {
      manager.clearHistory();
    }
    setStats(initialStats);
  }, []);

  return {
    // State
    stats,
    isInitialized,
    isUploading,
    error,

    // Actions
    uploadFiles,
    cancelUpload,
    cancelAll,
    pause,
    resume,
    retryFailed,
    clearHistory,
    initialize,

    // Computed
    hasActiveUploads: stats.active > 0,
    hasQueuedUploads: stats.queued > 0,
    hasFailedUploads: stats.failed > 0,
    progress: stats.overallProgress,
  };
}

export default useParallelUpload;
