import api from './api';

export const authService = {
  /**
   * Register a new user
   * @param {Object} data - Registration data
   * @param {string} data.email - User email
   * @param {string} data.password - User password
   * @param {string} data.encryptedMasterKey - Encrypted master key (base64)
   * @param {string} data.kekSalt - KEK salt (base64)
   * @param {Object} data.kdfParams - KDF parameters
   */
  async register(data) {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  /**
   * Login user
   * @param {Object} data - Login data
   * @param {string} data.email - User email
   * @param {string} data.password - User password
   */
  async login(data) {
    const response = await api.post('/auth/login', data);
    return response.data;
  },

  /**
   * Change password with zero-knowledge re-encryption
   * @param {Object} data - Change password data
   * @param {string} data.currentPassword - Current password
   * @param {string} data.newPassword - New password
   * @param {string} data.newEncryptedMasterKey - Re-encrypted master key with new KEK
   * @param {string} data.newKekSalt - New KEK salt
   */
  async changePassword(data) {
    const response = await api.post('/auth/change-password', data);
    return response.data;
  },

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   */
  async refreshToken(refreshToken) {
    const response = await api.post('/auth/refresh', { refreshToken });
    return response.data;
  },

  /**
   * Logout user (clear local storage)
   */
  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!localStorage.getItem('accessToken');
  },

  /**
   * Get current access token
   */
  getAccessToken() {
    return localStorage.getItem('accessToken');
  },

  /**
   * Store tokens in local storage
   * @param {Object} tokens - Token data
   * @param {string} tokens.accessToken - Access token
   * @param {string} tokens.refreshToken - Refresh token
   */
  storeTokens(tokens) {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
  },

  /**
   * Get encryption keys for re-unlocking master key
   * Returns encryptedMasterKey and kekSalt for the current user
   */
  async getEncryptionKeys() {
    const response = await api.get('/auth/encryption-keys');
    return response.data;
  },
};

export default authService;
