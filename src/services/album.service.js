import api from './api';

export const albumService = {
  /**
   * Create a new album
   * @param {Object} data - Album data
   * @param {string} data.titleEncrypted - Encrypted album title (base64)
   */
  async createAlbum(data) {
    const response = await api.post('/albums', data);
    return response.data;
  },

  /**
   * List all albums
   */
  async listAlbums() {
    const response = await api.get('/albums');
    return response.data;
  },

  /**
   * Get album details
   * @param {string} albumId - Album UUID
   */
  async getAlbum(albumId) {
    const response = await api.get(`/albums/${albumId}`);
    return response.data;
  },

  /**
   * Add files to an album
   * @param {string} albumId - Album UUID
   * @param {string[]} fileIds - Array of file UUIDs
   */
  async addFilesToAlbum(albumId, fileIds) {
    const response = await api.post(`/albums/${albumId}/files`, { fileIds });
    return response.data;
  },

  /**
   * List files in an album
   * @param {string} albumId - Album UUID
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   */
  async listAlbumFiles(albumId, params = {}) {
    const response = await api.get(`/albums/${albumId}/files`, { params });
    return response.data;
  },

  /**
   * Remove a file from an album
   * @param {string} albumId - Album UUID
   * @param {string} fileId - File UUID
   */
  async removeFileFromAlbum(albumId, fileId) {
    const response = await api.delete(`/albums/${albumId}/files/${fileId}`);
    return response.data;
  },

  /**
   * Delete an album
   * @param {string} albumId - Album UUID
   */
  async deleteAlbum(albumId) {
    const response = await api.delete(`/albums/${albumId}`);
    return response.data;
  },
};

export default albumService;
