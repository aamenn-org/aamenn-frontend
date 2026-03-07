/**
 * Services Module
 *
 * Centralized exports for all API services and utilities.
 *
 * Structure:
 * - api: Axios instance with auth interceptors and unified response handling
 * - apiResponseHandler: Utilities for handling unified API responses
 * - authService: Authentication (login, register, tokens)
 * - userService: User profile and security
 * - fileService: File CRUD, favorites, batch operations
 * - albumService: Album management
 * - cache: Multi-layer caching (memory + IndexedDB)
 * - uploadPrewarmer: Worker pre-warming for fast uploads
 */

// Core API client with unified response handling
export { default as api } from './api';

// API response handler utilities (for custom error handling)
export { 
  ApiError, 
  ErrorType, 
  isApiError,
  wrapApiCall 
} from './api-response-handler';

// Domain services
export { default as authService } from './auth.service';
export { default as userService } from './user.service';
export { default as fileService } from './file.service';
export { default as albumService } from './album.service';
export { default as adminService } from './admin.service';
export { default as shareService } from './share.service';

// Cache system (L1: memory, L2: IndexedDB)
export { thumbnailCache } from './cache';

// Upload optimization
export {
  triggerWarmup,
  resetPrewarmer,
} from './upload-prewarmer';
