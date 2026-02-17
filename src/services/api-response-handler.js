/**
 * Unified API Response Handler
 * 
 * Centralized handling for all API responses following the unified format:
 * Success: { success: true, data: T, message?, meta? }
 * Error: { success: false, error: { code, message, details?, type? }, meta? }
 * 
 * This module provides:
 * - Automatic response unwrapping (extracts data from success responses)
 * - Consistent error handling and transformation
 * - Type-safe error categorization
 * - No breaking changes to existing service methods
 */

/**
 * Error types matching backend categorization
 */
export const ErrorType = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  UNPROCESSABLE_ERROR: 'UNPROCESSABLE_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_GATEWAY_ERROR: 'BAD_GATEWAY_ERROR',
  SERVICE_UNAVAILABLE_ERROR: 'SERVICE_UNAVAILABLE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

/**
 * Custom API Error class with enhanced error information
 */
export class ApiError extends Error {
  constructor(code, message, type, details, meta) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.type = type;
    this.details = details;
    this.meta = meta;
    this.isApiError = true;
  }

  /**
   * Check if error is of a specific type
   */
  isType(errorType) {
    return this.type === errorType;
  }

  /**
   * Check if error is authentication related
   */
  isAuthError() {
    return this.type === ErrorType.AUTHENTICATION_ERROR || 
           this.type === ErrorType.AUTHORIZATION_ERROR;
  }

  /**
   * Check if error is validation related
   */
  isValidationError() {
    return this.type === ErrorType.VALIDATION_ERROR;
  }

  /**
   * Get validation errors for specific fields
   */
  getFieldErrors() {
    return this.details || {};
  }
}

/**
 * Handle successful API responses
 * Extracts data from unified response format
 * 
 * @param {Object} response - Axios response object
 * @returns {any} - Unwrapped data from response.data.data
 */
export function handleSuccess(response) {
  const responseData = response.data;

  // Check if response follows unified format
  if (responseData && typeof responseData === 'object' && 'success' in responseData) {
    // Unified format: { success: true, data: T, message?, meta? }
    if (responseData.success === true) {
      // Return the data payload, preserving any metadata
      const result = responseData.data;
      
      // Attach metadata if present (useful for pagination, etc.)
      if (responseData.meta) {
        // If result is an object, attach meta to it
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          return { ...result, _meta: responseData.meta };
        }
        // Otherwise return as-is (meta available in original response if needed)
      }
      
      return result;
    }
  }

  // Fallback: return raw response data (for backwards compatibility)
  return responseData;
}

/**
 * Handle API error responses
 * Transforms errors into ApiError instances with consistent structure
 * 
 * @param {Error} error - Axios error object
 * @throws {ApiError} - Structured error with code, message, type, and details
 */
export function handleError(error) {
  // Network error (no response from server)
  if (!error.response) {
    throw new ApiError(
      0,
      error.message || 'Network error',
      ErrorType.NETWORK_ERROR,
      null,
      { originalError: error.message }
    );
  }

  const { status, data } = error.response;

  // Check if error follows unified format
  if (data && typeof data === 'object' && 'success' in data && data.success === false) {
    // Unified error format: { success: false, error: { code, message, details?, type? }, meta? }
    const errorInfo = data.error || {};
    throw new ApiError(
      errorInfo.code || status,
      errorInfo.message || 'An error occurred',
      errorInfo.type || mapStatusToErrorType(status),
      errorInfo.details || null,
      data.meta || null
    );
  }

  // Legacy error format (for backwards compatibility during transition)
  if (data && typeof data === 'object') {
    throw new ApiError(
      data.statusCode || status,
      data.message || data.error || 'An error occurred',
      mapStatusToErrorType(status),
      data.details || null,
      null
    );
  }

  // Fallback for unexpected error formats
  throw new ApiError(
    status,
    'An unexpected error occurred',
    mapStatusToErrorType(status),
    null,
    null
  );
}

/**
 * Map HTTP status codes to error types
 * @param {number} status - HTTP status code
 * @returns {string} - Error type constant
 */
function mapStatusToErrorType(status) {
  const typeMap = {
    400: ErrorType.VALIDATION_ERROR,
    401: ErrorType.AUTHENTICATION_ERROR,
    403: ErrorType.AUTHORIZATION_ERROR,
    404: ErrorType.NOT_FOUND_ERROR,
    409: ErrorType.CONFLICT_ERROR,
    422: ErrorType.UNPROCESSABLE_ERROR,
    429: ErrorType.RATE_LIMIT_ERROR,
    500: ErrorType.INTERNAL_ERROR,
    502: ErrorType.BAD_GATEWAY_ERROR,
    503: ErrorType.SERVICE_UNAVAILABLE_ERROR,
  };

  return typeMap[status] || ErrorType.INTERNAL_ERROR;
}

/**
 * Wrap an async API call with unified response handling
 * Automatically handles success and error cases
 * 
 * @param {Promise} apiCall - Promise from axios request
 * @returns {Promise} - Promise that resolves with unwrapped data or rejects with ApiError
 */
export async function wrapApiCall(apiCall) {
  try {
    const response = await apiCall;
    return handleSuccess(response);
  } catch (error) {
    handleError(error);
  }
}

/**
 * Check if an error is an ApiError instance
 */
export function isApiError(error) {
  return error && error.isApiError === true;
}

export default {
  handleSuccess,
  handleError,
  wrapApiCall,
  isApiError,
  ApiError,
  ErrorType,
};
