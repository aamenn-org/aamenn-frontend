/**
 * Services Module
 *
 * Centralized exports for all API services and utilities.
 *
 * Structure:
 * - api: Axios instance with auth interceptors
 * - authService: Authentication (login, register, tokens)
 * - userService: User profile and security
 * - fileService: File CRUD, favorites, batch operations
 * - albumService: Album management
 * - cache: Multi-layer caching (memory + IndexedDB)
 * - parallel-upload: Web Worker-based upload system
 */

// Core API client
export { default as api } from './api';

// Domain services
export { default as authService } from './auth.service';
export { default as userService } from './user.service';
export { default as fileService } from './file.service';
export { default as albumService } from './album.service';

// Cache system (L1: memory, L2: IndexedDB)
export { thumbnailCache } from './cache';

// Parallel upload system (Web Workers)
export {
  getUploadManager,
  destroyUploadManager,
  UploadState,
} from './parallel-upload';
