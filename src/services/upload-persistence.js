/**
 * Upload Persistence — IndexedDB storage for chunked upload session state.
 *
 * Uses Dexie (already in the project) to persist upload sessions so they
 * survive tab close, browser crash, and page refresh.
 *
 * Stored data is safe to persist: cipherFileKey and fileNameEncrypted are
 * already encrypted with the user's master key (zero-knowledge preserved).
 */

import Dexie from 'dexie';

const db = new Dexie('aamenn_uploads');

db.version(1).stores({
  sessions: 'uploadId, serverSessionId, status, updatedAt',
});

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const uploadPersistence = {
  /**
   * Save or update an upload session.
   * @param {string} uploadId — client-side upload ID
   * @param {object} sessionData — session state to persist
   */
  async saveSession(uploadId, sessionData) {
    try {
      await db.sessions.put({
        ...sessionData,
        uploadId,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn('[uploadPersistence] Failed to save session:', e);
    }
  },

  /**
   * Get a single session by client upload ID.
   * @param {string} uploadId
   * @returns {Promise<object|undefined>}
   */
  async getSession(uploadId) {
    try {
      return await db.sessions.get(uploadId);
    } catch (e) {
      console.warn('[uploadPersistence] Failed to get session:', e);
      return undefined;
    }
  },

  /**
   * Remove a session (on completion or cancel).
   * @param {string} uploadId
   */
  async removeSession(uploadId) {
    try {
      await db.sessions.delete(uploadId);
    } catch (e) {
      console.warn('[uploadPersistence] Failed to remove session:', e);
    }
  },

  /**
   * Get all sessions that are not expired (< 7 days old).
   * @returns {Promise<object[]>}
   */
  async getAllSessions() {
    try {
      const cutoff = Date.now() - MAX_AGE_MS;
      const all = await db.sessions.where('updatedAt').above(cutoff).toArray();
      return all;
    } catch (e) {
      console.warn('[uploadPersistence] Failed to get all sessions:', e);
      return [];
    }
  },

  /**
   * Delete all sessions (e.g. on logout).
   */
  async clearAll() {
    try {
      await db.sessions.clear();
    } catch (e) {
      console.warn('[uploadPersistence] Failed to clear sessions:', e);
    }
  },
};
