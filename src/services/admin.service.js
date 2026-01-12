import api from './api';

/**
 * Admin Service - API calls for admin dashboard
 */

/**
 * Get dashboard overview statistics
 */
export const getDashboardStats = async () => {
  const response = await api.get('/admin/dashboard');
  return response.data;
};

/**
 * Get paginated list of users
 */
export const getUsers = async (params = {}) => {
  const response = await api.get('/admin/users', { params });
  return response.data;
};

/**
 * Get top users by storage
 */
export const getTopUsersByStorage = async (limit = 10) => {
  const response = await api.get('/admin/users/top-storage', {
    params: { limit },
  });
  return response.data;
};

/**
 * Update user status (enable/disable)
 */
export const updateUserStatus = async (userId, status) => {
  const response = await api.patch(`/admin/users/${userId}/status`, status);
  return response.data;
};

/**
 * Get storage statistics
 */
export const getStorageStats = async () => {
  const response = await api.get('/admin/storage');
  return response.data;
};

/**
 * Get system health status
 */
export const getSystemHealth = async () => {
  const response = await api.get('/admin/health');
  return response.data;
};

/**
 * Get system alerts
 */
export const getAlerts = async () => {
  const response = await api.get('/admin/alerts');
  return response.data;
};

export default {
  getDashboardStats,
  getUsers,
  getTopUsersByStorage,
  updateUserStatus,
  getStorageStats,
  getSystemHealth,
  getAlerts,
};
