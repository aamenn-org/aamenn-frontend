/**
 * Centralized token storage.
 * Single source of truth for all token read/write/clear operations.
 * Both api.js and auth.service.js delegate here to avoid duplication.
 */

const TOKEN_KEYS = {
  ACCESS: 'accessToken',
  REFRESH: 'refreshToken',
};

/**
 * Read the current access token from localStorage or sessionStorage.
 * @returns {string | null}
 */
export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEYS.ACCESS) || sessionStorage.getItem(TOKEN_KEYS.ACCESS);
}

/**
 * Read the current refresh token from localStorage or sessionStorage.
 * @returns {string | null}
 */
export function getRefreshToken() {
  return localStorage.getItem(TOKEN_KEYS.REFRESH) || sessionStorage.getItem(TOKEN_KEYS.REFRESH);
}

/**
 * Store tokens after login.
 * Uses localStorage when rememberMe is true, sessionStorage otherwise.
 * @param {{ accessToken: string, refreshToken: string, rememberMe: boolean }} tokens
 */
export function storeTokens({ accessToken, refreshToken, rememberMe }) {
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEYS.ACCESS, accessToken);
  storage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
}

/**
 * Overwrite both tokens after a silent refresh.
 * Preserves whichever storage the user originally chose (localStorage vs sessionStorage).
 * @param {{ accessToken: string, refreshToken: string }} tokens
 */
export function refreshStoredTokens({ accessToken, refreshToken }) {
  const inSessionStorage =
    !localStorage.getItem(TOKEN_KEYS.REFRESH) &&
    !!sessionStorage.getItem(TOKEN_KEYS.REFRESH);
  const storage = inSessionStorage ? sessionStorage : localStorage;
  storage.setItem(TOKEN_KEYS.ACCESS, accessToken);
  storage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
}

/**
 * Remove all tokens from both storages (logout).
 */
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEYS.ACCESS);
  localStorage.removeItem(TOKEN_KEYS.REFRESH);
  sessionStorage.removeItem(TOKEN_KEYS.ACCESS);
  sessionStorage.removeItem(TOKEN_KEYS.REFRESH);
}

/**
 * Returns true if an access token is present in any storage.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!getAccessToken();
}
