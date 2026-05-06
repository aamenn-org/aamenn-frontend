import api from './api';

export const shareService = {
  /**
 * Create a single unified share link for any selection of files and/or folders.
   * @param {Object} payload
   * @param {Array<{type: string, id: string}>} payload.items
   * @param {string} payload.slugBase
   * @param {string} payload.shareKey
   * @param {Record<string, string>} [payload.fileKeys]
   * @param {number|null} [payload.expiresInSeconds]
   */
  async createShare(payload) {
        const response = await api.post('/shares', payload);
    return response.data;
  },

  /**
   * List user's share links
   * @param {Object} params
   * @param {number} [params.page]
   * @param {number} [params.limit]
   */
  async listShares(params = {}) {
    const response = await api.get('/shares', { params });
    return response.data;
  },

  /**
   * Revoke a share link
   * @param {string} shareId
   */
  async revokeShare(shareId) {
    const response = await api.delete(`/shares/${shareId}`);
    return response.data;
  },

  /**
   * Resolve a public share link (no auth required)
   * Returns: { shareKey, fileKeys, items: SharedRootItem[] }
   * @param {string} slug
   */
  async resolveShare(slug) {
    const response = await api.get(`/shares/${slug}`);
    return response.data;
  },
 
  /**
   * Browse a folder within a share (no auth required)
   * Returns: { folderId, nameEncrypted, items: SharedRootItem[] }
   * @param {string} slug
   * @param {string} folderId
   */
  async browseShare(slug, folderId) {
    const response = await api.get(`/shares/${slug}/browse/${folderId}`);
    return response.data;
  },

  /**
   * Save shared files to the authenticated user's account (requires auth).
   * File keys and filenames are re-encrypted with the user's master key on the client side.
   * @param {string} slug
   * @param {Array<{originalFileId: string, cipherFileKey: string, fileNameEncrypted: string}>} files
   * @returns {Promise<{success: boolean, savedCount: number}>}
   */
  async saveToAccount(slug, files) {
    const response = await api.post(`/shares/${slug}/save-to-account`, { files });
    return response.data;
  },
};

export default shareService;
