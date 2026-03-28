import axios from 'axios';
import config from '../config';
import { handleSuccess, handleError } from './api-response-handler';
import {
  getAccessToken,
  getRefreshToken,
  refreshStoredTokens,
  clearTokens,
} from './token-storage.js';

// Create axios instance with default config
const api = axios.create({
  baseURL: config.apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and fix FormData Content-Type
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // When body is FormData, remove the default Content-Type: application/json.
    // The browser XHR will then auto-set Content-Type: multipart/form-data; boundary=...
    // which is required for the server's multer middleware to parse the body correctly.
    // Without this, body-parser's JSON parser intercepts the request → PayloadTooLargeError.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle unified responses and token refresh
api.interceptors.response.use(
  (response) => {
    // Automatically unwrap unified response format
    // This extracts data from { success: true, data: T } → T
    try {
      const unwrappedData = handleSuccess(response);
      // Return modified response with unwrapped data
      return { ...response, data: unwrappedData };
    } catch (error) {
      // If unwrapping fails, return original response (backwards compatibility)
      return response;
    }
  },
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = getRefreshToken();
        if (refreshToken) {
          // Use raw axios for refresh to avoid interceptor loop
          const response = await axios.post(`${config.apiUrl}/auth/refresh`, {
            refreshToken,
          });

          // Handle both unified and legacy response formats
          const responseData = response.data;
          let accessToken, newRefreshToken;
          
          if (responseData.success && responseData.data) {
            // Unified format: { success: true, data: { accessToken, refreshToken } }
            accessToken = responseData.data.accessToken;
            newRefreshToken = responseData.data.refreshToken;
          } else if (responseData.data) {
            // Legacy format: { data: { accessToken, refreshToken } }
            accessToken = responseData.data.accessToken;
            newRefreshToken = responseData.data.refreshToken;
          } else {
            // Direct format: { accessToken, refreshToken }
            accessToken = responseData.accessToken;
            newRefreshToken = responseData.refreshToken;
          }

          if (accessToken && newRefreshToken) {
            refreshStoredTokens({ accessToken, refreshToken: newRefreshToken });
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return api(originalRequest);
          }
        }
      } catch (refreshError) {
        // Clear tokens and redirect to login
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Transform error using unified error handler
    // This converts all errors to ApiError instances
    try {
      handleError(error);
    } catch (apiError) {
      return Promise.reject(apiError);
    }

    // Fallback (should not reach here)
    return Promise.reject(error);
  }
);

export default api;
