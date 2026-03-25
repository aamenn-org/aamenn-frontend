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
   * Logout user (clear both local and session storage)
   */
  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
  },

  /**
   * Check if user is authenticated
   * Checks both localStorage and sessionStorage
   */
  isAuthenticated() {
    return !!(localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken'));
  },

  /**
   * Get current access token
   * Checks both localStorage and sessionStorage
   */
  getAccessToken() {
    return localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
  },

  /**
   * Get current refresh token
   * Checks both localStorage and sessionStorage
   */
  getRefreshToken() {
    return localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
  },

  /**
   * Store tokens in appropriate storage based on remember me preference
   * @param {Object} tokens - Token data
   * @param {string} tokens.accessToken - Access token
   * @param {string} tokens.refreshToken - Refresh token
   * @param {boolean} tokens.rememberMe - Whether to persist across browser sessions
   */
  storeTokens(tokens) {
    const storage = tokens.rememberMe ? localStorage : sessionStorage;
    storage.setItem('accessToken', tokens.accessToken);
    storage.setItem('refreshToken', tokens.refreshToken);
  },

  /**
   * Login with Google ID token
   * @param {Object} data - Google login data
   * @param {string} data.idToken - Google ID token
   */
  async googleLogin(data) {
    const response = await api.post('/auth/google', data);
    return response.data;
  },

  /**
   * Request vault reset OTP
   */
  async vaultResetRequest(email) {
    const response = await api.post('/auth/vault-reset/request', { email });
    return response.data;
  },

  /**
   * Verify vault reset OTP
   */
  async vaultResetVerify(email, otp) {
    const response = await api.post('/auth/vault-reset/verify', { email, otp });
    return response.data;
  },

  /**
   * Get recovery params for vault reset
   */
  async vaultResetGetParams(resetToken) {
    const response = await api.post('/auth/vault-reset/params', { resetToken });
    return response.data;
  },

  /**
   * Complete vault reset with new password
   */
  async vaultResetComplete(data) {
    const response = await api.post('/auth/vault-reset/complete', data);
    return response.data;
  },

};

export default authService;
