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
 * @deprecated Use getUsers({ sortBy: 'storage', sortOrder: 'DESC', limit }) instead
 *
 * NOTE: the backend `/admin/users` returns a paginated object { users, total, ... }.
 * Historically this helper was expected to return an array — normalize here for callers.
 */
export const getTopUsersByStorage = async (limit = 10) => {
  const res = await getUsers({ sortBy: 'storage', sortOrder: 'DESC', limit });
  // If API already returns an array, return it; otherwise return the `users` array or empty array.
  return Array.isArray(res) ? res : res?.users || [];
};

/**
 * Permanently delete a user and all their data
 */
export const deleteUser = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}`);
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
  getTopUsersByStorage, // Deprecated: use getUsers with params
  deleteUser,
  updateUserStatus,
  getStorageStats,
  getSystemHealth,
  getAlerts,
};
