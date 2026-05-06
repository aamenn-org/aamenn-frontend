import api from './api';

export const folderService = {
  /**
   * Get unified library view (breadcrumbs + folders + files)
   * @param {Object} params
   * @param {string} [params.folderId] - Folder ID (omit for root)
   * @param {number} [params.page] - Page number
   * @param {number} [params.limit] - Items per page
   */
  async getLibrary(params = {}) {
    const response = await api.get('/folders/library', { params });
    return response.data;
  },

  /**
   * Create a new folder
   * @param {Object} data
   * @param {string} data.nameEncrypted - Encrypted folder name (base64)
   * @param {string} [data.parentFolderId] - Parent folder ID (omit for root)
   */
  async createFolder(data) {
    const response = await api.post('/folders', data);
    return response.data;
  },

  /**
   * Get folder details
   * @param {string} folderId
   */
  async getFolder(folderId) {
    const response = await api.get(`/folders/${folderId}`);
    return response.data;
  },

  /**
   * Update folder (rename or move)
   * @param {string} folderId
   * @param {Object} updates
   * @param {string} [updates.nameEncrypted] - New encrypted name
   * @param {string|null} [updates.parentFolderId] - New parent (null for root)
   */
  async updateFolder(folderId, updates) {
    const response = await api.patch(`/folders/${folderId}`, updates);
    return response.data;
  },

  /**
   * Delete folder (trash subtree)
   * @param {string} folderId
   */
  async deleteFolder(folderId) {
    const response = await api.delete(`/folders/${folderId}`);
    return response.data;
  },

  /**
   * Restore folder from trash
   * @param {string} folderId
   */
  async restoreFolder(folderId) {
    const response = await api.post(`/folders/${folderId}/restore`);
    return response.data;
  },

  /**
   * Permanently delete folder
   * @param {string} folderId
   */
  async deleteFolderPermanently(folderId) {
    const response = await api.delete(`/folders/${folderId}/permanent`);
    return response.data;
  },

  /**
   * Move files to a folder (or root)
   * @param {string[]} fileIds
   * @param {string|null} targetFolderId - null for root
   */
  async moveFilesToFolder(fileIds, targetFolderId) {
    const response = await api.post('/folders/move-files', {
      fileIds,
      targetFolderId,
    });
    return response.data;
  },

  /**
   * Move a folder to another parent (or root)
   * @param {string} folderId
   * @param {string|null} targetParentFolderId - null for root
   */
  async moveFolderToFolder(folderId, targetParentFolderId) {
    const response = await api.post(`/folders/${folderId}/move`, {
      targetParentFolderId,
    });
    return response.data;
  },

  /**
   * Get all files in a folder and its subfolders recursively.
   * Returns {fileId, fileNameEncrypted, cipherFileKey, mimeType} per file.
   * Used for generating share keys for folder sharing.
   * @param {string} folderId
   */
  async getAllFilesInFolder(folderId) {
    const response = await api.get(`/folders/${folderId}/all-files`);
    return response.data;
  },

  /**
   * List folders at a given level
   * @param {string} [parentFolderId] - omit for root
   */
  async listFolders(parentFolderId = null) {
    const params = {};
    if (parentFolderId) params.parentFolderId = parentFolderId;
    const response = await api.get('/folders', { params });
    return response.data;
  },
};

export default folderService;
