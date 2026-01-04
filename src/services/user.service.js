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
   * Get user security parameters
   */
  async getUserSecurity() {
    const response = await api.get('/users/security');
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
    const response = await api.post('/users/security', data);
    return response.data;
  },
};

export default userService;
