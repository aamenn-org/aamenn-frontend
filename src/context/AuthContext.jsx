import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authService, userService, fileService, thumbnailCache } from '../services';
import { generateRegistrationKeys, unlockMasterKey, generateRecoveryParams } from '../utils/crypto';
import { triggerWarmup, resetPrewarmer } from '../services/upload-prewarmer';
import { getCryptoWorkerPool } from '../workers';

const AuthContext = createContext(null);

// Storage keys
const MASTER_KEY_STORAGE_KEY = 'aamenn_mk';
const MASTER_KEY_TIMESTAMP_KEY = 'aamenn_mk_ts';
const ENCRYPTION_PARAMS_KEY = 'aamenn_enc_params';
const USER_ROLE_KEY = 'aamenn_role';
const MASTER_KEY_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

// User roles
export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

/**
 * Securely store master key in localStorage with timestamp for expiration.
 * Master key expires after 3 hours for security.
 */
const storeMasterKey = async (masterKey) => {
  try {
    // Convert CryptoKey to storable format
    const rawKey = await crypto.subtle.exportKey('raw', masterKey);
    const base64Key = btoa(
      String.fromCharCode(...new Uint8Array(rawKey))
    );

    // Store in localStorage with timestamp (persists across browser sessions)
    localStorage.setItem(MASTER_KEY_STORAGE_KEY, base64Key);
    localStorage.setItem(MASTER_KEY_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.error('Failed to store master key:', error);
  }
};

/**
 * Retrieve master key from localStorage if valid and not expired.
 * Returns null if expired or invalid.
 */
const retrieveMasterKey = async () => {
  try {
    const base64Key = localStorage.getItem(MASTER_KEY_STORAGE_KEY);
    const timestamp = localStorage.getItem(MASTER_KEY_TIMESTAMP_KEY);

    if (!base64Key || !timestamp) {
      return null;
    }

    // Check expiration (3 hours)
    const storedTime = parseInt(timestamp, 10);
    if (Date.now() - storedTime > MASTER_KEY_TIMEOUT_MS) {
      clearStoredMasterKey();
      return null;
    }

    // Convert base64 back to CryptoKey
    const rawKey = new Uint8Array(
      atob(base64Key)
        .split('')
        .map((c) => c.charCodeAt(0))
    );

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    return cryptoKey;
  } catch (error) {
    console.error('Failed to retrieve master key:', error);
    clearStoredMasterKey();
    return null;
  }
};

/**
 * Clear stored master key from localStorage.
 */
const clearStoredMasterKey = () => {
  localStorage.removeItem(MASTER_KEY_STORAGE_KEY);
  localStorage.removeItem(MASTER_KEY_TIMESTAMP_KEY);
};

/**
 * Store encryption params for password change flow
 */
const storeEncryptionParams = (params) => {
  sessionStorage.setItem(ENCRYPTION_PARAMS_KEY, JSON.stringify(params));
};

/**
 * Retrieve encryption params
 */
const retrieveEncryptionParams = () => {
  const params = sessionStorage.getItem(ENCRYPTION_PARAMS_KEY);
  return params ? JSON.parse(params) : null;
};

/**
 * Clear encryption params
 */
const clearEncryptionParams = () => {
  sessionStorage.removeItem(ENCRYPTION_PARAMS_KEY);
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [masterKeyAvailable, setMasterKeyAvailable] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Master key stored in memory (ref) for quick access
  // Also persisted in localStorage (3-hour timeout) for session resilience
  const masterKeyRef = useRef(null);

  // Pre-exported master key bytes (optimization: avoid repeated exportKey calls)
  // This is exported ONCE when master key is set, then cloned for each worker call
  const masterKeyBytesRef = useRef(null);

  /**
   * Export and cache master key bytes (called once when key is set)
   */
  const cacheMasterKeyBytes = async (masterKey) => {
    if (!masterKey) {
      masterKeyBytesRef.current = null;
      return;
    }
    try {
      const rawBytes = await crypto.subtle.exportKey('raw', masterKey);
      masterKeyBytesRef.current = rawBytes;
    } catch (error) {
      console.error('Failed to cache master key bytes:', error);
      masterKeyBytesRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false; // Guard against StrictMode double-invocation race conditions

    const checkAuth = async () => {
      const token = authService.getAccessToken();

      if (token) {
        setIsAuthenticated(true);

        // Restore role from storage
        const storedRole = localStorage.getItem(USER_ROLE_KEY);
        if (storedRole) {
          setUserRole(storedRole);
        }

        // Fetch full user profile from backend
        try {
          const userData = await userService.getCurrentUser();
          if (cancelled) return;
          setUser(userData);
        } catch (err) {
          if (cancelled) return;
          console.error('Failed to fetch user profile:', err);

          // Check if user was deleted — ApiError uses .code (HTTP status) and .type
          const isUserGone =
            err?.code === 404 || err?.code === 409 ||
            err?.type === 'NOT_FOUND_ERROR' || err?.type === 'CONFLICT_ERROR' ||
            err?.response?.status === 404 || err?.response?.status === 409;

          if (isUserGone) {
            console.log('User account no longer exists, clearing session and redirecting to login');
            // Clear all storage first so the login page starts clean
            authService.logout();
            localStorage.removeItem('userEmail');
            localStorage.removeItem(USER_ROLE_KEY);
            clearStoredMasterKey();
            clearEncryptionParams();
            // Hard redirect — bypasses any React state/routing issues
            window.location.href = '/login';
            return;
          }

          // Fallback to stored email only for transient network errors
          const storedEmail = localStorage.getItem('userEmail');
          if (storedEmail) {
            setUser({ email: storedEmail });
          }
        }

        if (cancelled) return;

        // Try to restore master key from localStorage (if not expired)
        const storedKey = await retrieveMasterKey();
        if (cancelled) return;
        if (storedKey) {
          masterKeyRef.current = storedKey;
          await cacheMasterKeyBytes(storedKey); // Pre-export bytes for performance
          setMasterKeyAvailable(true);
          console.log('Master key restored from storage');

          // Pre-warm workers for fast uploads (non-blocking)
          triggerWarmup();
        }
      }
      if (!cancelled) setLoading(false);
    };

    checkAuth();
    return () => { cancelled = true; };
  }, []);

  /**
   * Effect to load/decrypt avatar whenever avatarFileId or masterKeyBytes changes
   * Reuses the 3-layer cache (Memory -> IndexedDB -> Network) for instant loading
   */
  useEffect(() => {
    const loadAvatar = async () => {
      if (!user?.avatarFileId) {
        setAvatarUrl(null);
        return;
      }

      if (!masterKeyAvailable) return;
      const mk = getMasterKey();
      if (!mk) return;

      try {
        // 1. Get file metadata (required for URL and Key)
        const fileData = await fileService.getFile(user.avatarFileId);
        
        // 2. Use 3-layer cache system (handles L1 memory, L2 IndexedDB, L3 Decryption)
        // treating avatar as a high-priority thumbnail
        const cachedUrl = await thumbnailCache.getThumbnailWithPriority(
          user.avatarFileId,
          fileData.downloadUrl,
          mk,
          fileData.cipherFileKey,
          {
            priority: 'high',
            masterKeyBytes: getMasterKeyBytes()
          }
        );
        
        setAvatarUrl(cachedUrl);
      } catch (err) {
        console.error('AuthContext: Failed to load avatar:', err);
      }
    };

    loadAvatar();
    
    // Note: We don't revokeObjectURL here because thumbnailCache manages 
    // its own blob URL lifetimes in its internal LRU cache
  }, [user?.avatarFileId, masterKeyAvailable]);

  /**
   * Login user and unlock master key
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {boolean} rememberMe - Whether to persist login across browser sessions
   */
  const login = async (email, password, rememberMe = true) => {
    try {
      console.log('AuthContext: Calling authService.login');
      const response = await authService.login({ email, password });
      console.log('AuthContext: Login response:', response);

      // Backend returns data directly (not wrapped in success/data)
      const { accessToken, refreshToken, encryptedMasterKey, kekSalt, role, authProvider } =
        response;

      if (accessToken && refreshToken) {
        console.log('AuthContext: Login successful, tokens received');

        // Store tokens based on remember me preference
        authService.storeTokens({ accessToken, refreshToken, rememberMe });

        // Store email, role, and authProvider for user display
        localStorage.setItem('userEmail', email);
        localStorage.setItem(USER_ROLE_KEY, role || USER_ROLES.USER);
        localStorage.setItem('authProvider', authProvider || 'local');
        setUserRole(role || USER_ROLES.USER);

        // Unlock master key with password (zero-knowledge) - only for regular users
        if (role !== USER_ROLES.ADMIN && encryptedMasterKey && kekSalt) {
          console.log('AuthContext: Attempting to unlock master key');
          // Store encryption params for password change flow
          storeEncryptionParams({ encryptedMasterKey, kekSalt });
          try {
            const masterKey = await unlockMasterKey(
              password,
              encryptedMasterKey,
              kekSalt
            );
            masterKeyRef.current = masterKey;
            await cacheMasterKeyBytes(masterKey); // Pre-export bytes for performance
            setMasterKeyAvailable(true);
            storeMasterKey(masterKey); // Persist in localStorage for 3 hours
            console.log('AuthContext: Master key unlocked and stored');

            // Pre-warm workers for fast uploads (non-blocking)
            triggerWarmup();
          } catch (cryptoError) {
            console.error(
              'AuthContext: Failed to unlock master key:',
              cryptoError
            );
            // Continue anyway - some features won't work
          }
        } else if (role === USER_ROLES.ADMIN) {
          console.log('AuthContext: Admin user - skipping master key unlock');
        } else {
          console.warn(
            'AuthContext: No encryptedMasterKey or kekSalt received'
          );
        }

        setUser({ email, role: role || USER_ROLES.USER });
        setIsAuthenticated(true);

        // Fetch full profile in background to get avatarFileId etc.
        userService.getCurrentUser().then(fullUser => {
          setUser(fullUser);
        }).catch(() => {});

        console.log('AuthContext: Returning success');
        return { success: true, data: response, role: role || USER_ROLES.USER };
      }

      console.log('AuthContext: No tokens received');
      return { success: false, error: 'Login failed' };
    } catch (error) {
      console.error('AuthContext: Login error:', error);
      const message =
        error.response?.data?.message || 'Login failed. Please try again.';
      return { success: false, error: message };
    }
  };

  /**
   * Register user with zero-knowledge encryption
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} displayName - User display name
   * @param {boolean} rememberMe - Whether to persist login (defaults to true for new users)
   */
  const register = async (email, password, displayName, rememberMe = true) => {
    try {
      const { encryptedMasterKey, kekSalt, kdfParams, masterKey } =
        await generateRegistrationKeys(password);

      const recoveryData = await generateRecoveryParams(masterKey);

      // Send to server (server cannot decrypt master key)
      const response = await authService.register({
        email,
        password,
        encryptedMasterKey,
        kekSalt,
        kdfParams,
        displayName,
        recoveryEncryptedMasterKey: recoveryData.recoveryEncryptedMasterKey,
        recoverySalt: recoveryData.recoverySalt,
        recoveryKdfParams: recoveryData.recoveryKdfParams,
        encryptedRecoveryKey: recoveryData.encryptedRecoveryKey,
      });
      // Backend returns data directly (not wrapped in success/data)
      const { accessToken, refreshToken } = response;

      if (accessToken && refreshToken) {
        authService.storeTokens({ accessToken, refreshToken, rememberMe });
        localStorage.setItem('userEmail', email);

        masterKeyRef.current = masterKey;
        await cacheMasterKeyBytes(masterKey);
        setMasterKeyAvailable(true);
        storeMasterKey(masterKey);
        triggerWarmup();

        // Do NOT set isAuthenticated here — SignUpPage shows recovery dialog first,
        // then navigates via window.location.href which triggers a full page reload
        // and the auth check will pick up the stored tokens automatically.
        setUser({ email, hasSecuritySetup: true });

        return { success: true, data: response, recoveryPhrase: recoveryData.recoveryPhrase };
      }

      return { success: false, error: 'Registration failed' };
    } catch (error) {
      console.error('AuthContext: Register error:', error);
      const message =
        error.response?.data?.message ||
        'Registration failed. Please try again.';
      return { success: false, error: message };
    }
  };

  /**
   * Login with Google
   */
  const loginWithGoogle = async (idToken) => {
    try {
      const response = await authService.googleLogin({ idToken });
      const { accessToken, refreshToken, role, authProvider, requiresVaultSetup } = response;

      if (accessToken && refreshToken) {
        authService.storeTokens({ accessToken, refreshToken, rememberMe: true });
        localStorage.setItem(USER_ROLE_KEY, role || USER_ROLES.USER);
        localStorage.setItem('authProvider', authProvider || 'google');
        setUserRole(role || USER_ROLES.USER);
        setUser({ 
          email: response.email || 'Google User', 
          role: role || USER_ROLES.USER,
          hasSecuritySetup: !requiresVaultSetup 
        });
        setIsAuthenticated(true);

        // Fetch full profile in background
        userService.getCurrentUser().then(fullUser => {
          setUser(fullUser);
        }).catch(() => {});

        return {
          success: true,
          requiresVaultSetup,
          encryptedMasterKey: response.encryptedMasterKey,
          kekSalt: response.kekSalt,
          kdfParams: response.kdfParams,
        };
      }

      return { success: false, error: 'Google login failed' };
    } catch (error) {
      console.error('AuthContext: Google login error:', error);
      const message = error.response?.data?.message || 'Google login failed';
      return { success: false, error: message };
    }
  };

  /**
   * Logout and clear master key from memory and storage
   */
  const logout = async () => {
    authService.logout();
    localStorage.removeItem('userEmail');
    localStorage.removeItem(USER_ROLE_KEY);
    masterKeyRef.current = null;
    masterKeyBytesRef.current = null; // Clear cached bytes
    setMasterKeyAvailable(false);
    setUserRole(null);
    clearStoredMasterKey(); // Clear from sessionStorage
    clearEncryptionParams(); // Clear encryption params

    // Reset prewarmer state
    resetPrewarmer();

    // Clear thumbnail cache on logout
    try {
      const { thumbnailCache } = await import(
        '../services/cache/thumbnail-cache'
      );
      await thumbnailCache.clear();
    } catch (error) {
      console.error('Failed to clear cache on logout:', error);
    }

    setUser(null);
    setIsAuthenticated(false);
  };

  /**
   * Get encryption params for password change
   */
  const getEncryptionParams = () => {
    return retrieveEncryptionParams();
  };

  /**
   * Update encryption params after password change
   */
  const updateEncryptionParams = (newParams) => {
    storeEncryptionParams(newParams);
  };

  /**
   * Get master key (for file encryption/decryption)
   */
  const getMasterKey = () => {
    return masterKeyRef.current;
  };

  /**
   * Check if master key is available
   */
  const hasMasterKey = () => {
    return masterKeyRef.current !== null;
  };

  /**
   * Get pre-exported master key bytes (avoids repeated exportKey calls)
   * Returns a COPY to prevent mutation of cached bytes
   */
  const getMasterKeyBytes = () => {
    if (!masterKeyBytesRef.current) return null;
    return masterKeyBytesRef.current.slice(); // Return copy
  };

  /**
   * Set master key (for re-unlock after session expiry)
   * Also stores in sessionStorage for tab refresh resilience
   */
  const setMasterKey = (masterKey) => {
    masterKeyRef.current = masterKey;
    setMasterKeyAvailable(masterKey !== null);
    storeMasterKey(masterKey); // Persist in sessionStorage for 3 hours
  };

  /**
   * Check if current user is admin
   */
  const isAdmin = () => {
    return userRole === USER_ROLES.ADMIN;
  };

  const value = {
    user,
    setUser,
    avatarUrl,
    setAvatarUrl,
    loading,
    isAuthenticated,
    login,
    register,
    loginWithGoogle,
    logout,
    getMasterKey,
    getMasterKeyBytes,
    hasMasterKey,
    setMasterKey,
    masterKeyAvailable, // Boolean state for React effects
    getEncryptionParams,
    updateEncryptionParams,
    userRole,
    isAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
