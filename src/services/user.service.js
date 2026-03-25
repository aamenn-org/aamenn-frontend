import api from './api';

export const userService = {
  /**
   * Get current user profile
   */
  async getCurrentUser() {
    const response = await api.get('/users/me');
    return response.data;
  },

  /**
   * Update current user profile
   * @param {Object} data - Profile data
   * @param {string} [data.displayName] - User's display name
   */
  async updateProfile(data) {
    const response = await api.patch('/users/me', data);
    return response.data;
  },

  /**
   * Delete current user account
   * @param {string} password - User's password for confirmation
   */
  async deleteAccount(password) {
    const response = await api.delete('/users/me', {
      data: { password },
    });
    return response.data;
  },

  /**
   * Get storage usage for current user
   */
  async getStorageUsage() {
    const response = await api.get('/users/me/storage');
    return response.data;
  },

  /**
   * Get user security parameters
   */
  async getUserSecurity() {
    const response = await api.get('/users/me/security');
    return response.data;
  },

  /**
   * Setup user security parameters
   * @param {Object} data - Security setup data
   * @param {string} data.encryptedMasterKey - Encrypted master key (base64)
   * @param {string} data.kekSalt - KEK salt (base64)
   * @param {Object} data.kdfParams - KDF parameters
   */
  async setupSecurity(data) {
    const response = await api.post('/users/me/security', data);
    return response.data;
  },

  /**
   * Change vault password (re-encrypts master key with new password)
   * @param {Object} data
   * @param {string} data.currentPassword
   * @param {string} data.newPassword
   * @param {string} data.newEncryptedMasterKey
   * @param {string} data.newKekSalt
   */
  async changeVaultPassword(data) {
    const response = await api.patch('/users/me/vault-password', data);
    return response.data;
  },

  /**
   * Upload an encrypted avatar image via the dedicated avatar endpoint.
   * The file is stored with isAvatar=true and excluded from gallery/folder listings.
   * Also atomically updates the user's avatarFileId.
   *
   * @param {Blob} encryptedBlob - Encrypted file blob
   * @param {Object} metadata
   * @param {string} metadata.fileNameEncrypted - Encrypted filename
   * @param {string} metadata.cipherFileKey - Encrypted file key
   * @param {string} metadata.mimeType - File MIME type
   * @param {string} metadata.sha1Hash - SHA1 hash of encrypted content
   * @returns {Promise<{fileId: string, downloadUrl: string, avatarFileId: string}>}
   */
  async uploadAvatar(encryptedBlob, metadata) {
    const formData = new FormData();
    formData.append('file', encryptedBlob);
    formData.append('fileNameEncrypted', metadata.fileNameEncrypted);
    formData.append('cipherFileKey', metadata.cipherFileKey);
    formData.append('mimeType', metadata.mimeType);
    formData.append('sha1Hash', metadata.sha1Hash);

    const response = await api.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default userService;
