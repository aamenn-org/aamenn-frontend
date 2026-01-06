import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authService, userService } from '../services';
import { generateRegistrationKeys, unlockMasterKey } from '../utils/crypto';
import { triggerWarmup, resetPrewarmer } from '../services/upload-prewarmer';

const AuthContext = createContext(null);

// Session storage keys
const MASTER_KEY_STORAGE_KEY = 'aamenn_mk';
const MASTER_KEY_TIMESTAMP_KEY = 'aamenn_mk_ts';
const ENCRYPTION_PARAMS_KEY = 'aamenn_enc_params';
const SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

/**
 * Securely store master key in sessionStorage with timestamp.
 * SessionStorage is tab-specific and cleared when tab closes.
 */
const storeMasterKey = (masterKey) => {
  try {
    // Convert CryptoKey to exportable format (raw bytes -> base64)
    crypto.subtle.exportKey('raw', masterKey).then((rawKey) => {
      const base64Key = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
      sessionStorage.setItem(MASTER_KEY_STORAGE_KEY, base64Key);
      sessionStorage.setItem(MASTER_KEY_TIMESTAMP_KEY, Date.now().toString());
    });
  } catch (error) {
    console.error('Failed to store master key:', error);
  }
};

/**
 * Retrieve master key from sessionStorage if valid and not expired.
 * Returns null if expired or invalid.
 */
const retrieveMasterKey = async () => {
  try {
    const base64Key = sessionStorage.getItem(MASTER_KEY_STORAGE_KEY);
    const timestamp = sessionStorage.getItem(MASTER_KEY_TIMESTAMP_KEY);

    if (!base64Key || !timestamp) {
      return null;
    }

    // Check expiration (3 hours)
    const storedTime = parseInt(timestamp, 10);
    if (Date.now() - storedTime > SESSION_TIMEOUT_MS) {
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
 * Clear stored master key from sessionStorage.
 */
const clearStoredMasterKey = () => {
  sessionStorage.removeItem(MASTER_KEY_STORAGE_KEY);
  sessionStorage.removeItem(MASTER_KEY_TIMESTAMP_KEY);
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

  // Master key stored in memory (ref) for quick access
  // Also persisted in sessionStorage for tab refresh resilience
  const masterKeyRef = useRef(null);

  useEffect(() => {
    // Check if user is already authenticated on mount
    const checkAuth = async () => {
      const token = authService.getAccessToken();

      if (token) {
        setIsAuthenticated(true);

        // Fetch full user profile from backend
        try {
          const userData = await userService.getCurrentUser();
          setUser(userData);
        } catch (err) {
          console.error('Failed to fetch user profile:', err);
          // Fallback to stored email if API fails
          const storedEmail = localStorage.getItem('userEmail');
          if (storedEmail) {
            setUser({ email: storedEmail });
          }
        }

        // Try to restore master key from sessionStorage
        const storedKey = await retrieveMasterKey();
        if (storedKey) {
          masterKeyRef.current = storedKey;
          setMasterKeyAvailable(true);
          console.log('Master key restored from session');

          // Pre-warm workers for fast uploads (non-blocking)
          triggerWarmup();
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  /**
   * Login user and unlock master key
   */
  const login = async (email, password) => {
    try {
      console.log('AuthContext: Calling authService.login');
      const response = await authService.login({ email, password });
      console.log('AuthContext: Login response:', response);

      // Backend returns data directly (not wrapped in success/data)
      const { accessToken, refreshToken, encryptedMasterKey, kekSalt } =
        response;

      if (accessToken && refreshToken) {
        console.log('AuthContext: Login successful, tokens received');

        // Store tokens
        authService.storeTokens({ accessToken, refreshToken });

        // Store email for user display
        localStorage.setItem('userEmail', email);

        // Unlock master key with password (zero-knowledge)
        if (encryptedMasterKey && kekSalt) {
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
            setMasterKeyAvailable(true);
            storeMasterKey(masterKey); // Persist in sessionStorage for 3 hours
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
        } else {
          console.warn(
            'AuthContext: No encryptedMasterKey or kekSalt received'
          );
        }

        setUser({ email });
        setIsAuthenticated(true);
        console.log('AuthContext: Returning success');
        return { success: true, data: response };
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
   */
  const register = async (email, password) => {
    try {
      console.log('AuthContext: Starting registration');
      // Generate encryption keys on client side
      console.log('AuthContext: Generating registration keys');
      const { encryptedMasterKey, kekSalt, kdfParams, masterKey } =
        await generateRegistrationKeys(password);
      console.log('AuthContext: Keys generated successfully');

      // Send to server (server cannot decrypt master key)
      const response = await authService.register({
        email,
        password,
        encryptedMasterKey,
        kekSalt,
        kdfParams,
      });
      console.log('AuthContext: Register response:', response);

      // Backend returns data directly (not wrapped in success/data)
      const { accessToken, refreshToken } = response;

      if (accessToken && refreshToken) {
        console.log('AuthContext: Registration successful, storing tokens');
        authService.storeTokens({ accessToken, refreshToken });

        // Store email for user display
        localStorage.setItem('userEmail', email);

        // Store master key in memory and sessionStorage
        masterKeyRef.current = masterKey;
        setMasterKeyAvailable(true);
        storeMasterKey(masterKey); // Persist in sessionStorage for 3 hours

        // Pre-warm workers for fast uploads (non-blocking)
        triggerWarmup();

        setUser({ email });
        setIsAuthenticated(true);
        console.log('AuthContext: Returning success');
        return { success: true, data: response };
      }

      console.log('AuthContext: No tokens received');
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
   * Logout and clear master key from memory and storage
   */
  const logout = async () => {
    authService.logout();
    localStorage.removeItem('userEmail');
    masterKeyRef.current = null;
    setMasterKeyAvailable(false);
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
   * Set master key (for re-unlock after session expiry)
   * Also stores in sessionStorage for tab refresh resilience
   */
  const setMasterKey = (masterKey) => {
    masterKeyRef.current = masterKey;
    setMasterKeyAvailable(masterKey !== null);
    storeMasterKey(masterKey); // Persist in sessionStorage for 3 hours
  };

  const value = {
    user,
    setUser,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    getMasterKey,
    hasMasterKey,
    setMasterKey,
    masterKeyAvailable, // Boolean state for React effects
    getEncryptionParams,
    updateEncryptionParams,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
