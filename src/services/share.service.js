import api from './api';

export const shareService = {
  /**
   * Create share links for files or albums
   * @param {Array} items - Array of {type, id, slugBase, shareKey, expiresInSeconds}
   */
  async createShares(items) {
    const payload = { items };
    console.log('Share service - sending payload:', JSON.stringify(payload, null, 2));
    const response = await api.post('/shares', payload);
    return response.data;
  },

  /**
   * List user's share links
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   */
  async listShares(params = {}) {
    const response = await api.get('/shares', { params });
    return response.data;
  },

  /**
   * Revoke a share link
   * @param {string} shareId - Share link UUID
   */
  async revokeShare(shareId) {
    const response = await api.delete(`/shares/${shareId}`);
    return response.data;
  },

  /**
   * Resolve a public share link (no auth required)
   * @param {string} slug - Share link slug
   * @param {Object} params - Query parameters (for album pagination)
   */
  async resolveShare(slug, params = {}) {
    const response = await api.get(`/shares/${slug}`, { params });
    return response.data;
  },
};

export default shareService;
