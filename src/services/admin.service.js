import api from './api';

export const adminService = {
  async getDashboardStats() {
    const response = await api.get('/admin/dashboard');
    return response.data;
  },

  async getUsers(params = {}) {
    const response = await api.get('/admin/users', { params });
    return response.data;
  },

  /**
   * @deprecated Use getUsers({ sortBy: 'storage', sortOrder: 'DESC', limit }) instead
   */
  async getTopUsersByStorage(limit = 10) {
    const res = await this.getUsers({ sortBy: 'storage', sortOrder: 'DESC', limit });
    return Array.isArray(res) ? res : res?.users || [];
  },

  async deleteUser(userId) {
    const response = await api.delete(`/admin/users/${userId}`);
    return response.data;
  },

  async updateUserStatus(userId, status) {
    const response = await api.patch(`/admin/users/${userId}/status`, status);
    return response.data;
  },

  async setUserStorageLimit(userId, storageLimitGb) {
    const response = await api.patch(`/admin/users/${userId}/storage-limit`, { storageLimitGb });
    return response.data;
  },

  async getStorageStats() {
    const response = await api.get('/admin/storage');
    return response.data;
  },

  async getSystemHealth() {
    const response = await api.get('/admin/health');
    return response.data;
  },

  async getAlerts() {
    const response = await api.get('/admin/alerts');
    return response.data;
  },

  async getFlaggedSignups(params = {}) {
    const response = await api.get('/admin/flagged-signups', { params });
    return response.data;
  },

  async resolveFlaggedSignup(userId) {
    const response = await api.patch(`/admin/flagged-signups/${userId}/resolve`);
    return response.data;
  },

  async getFeedbacks(params = {}) {
    const response = await api.get('/feedback', { params });
    return response.data;
  },

  async getFeedbackStats() {
    const response = await api.get('/feedback/stats');
    return response.data;
  },
};

export default adminService;
