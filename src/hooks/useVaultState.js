import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * useVaultState
 * 
 * Centralized hook for vault state management.
 * Single source of truth for vault configuration and unlock status.
 */
export const useVaultState = () => {
  const { user, hasMasterKey } = useAuth();

  const vaultState = useMemo(() => {
    // Wait for user data to be loaded before calculating state
    if (!user) {
      return {
        vaultConfigured: false,
        masterKeyLoaded: false,
        needsVaultSetup: false, // Don't show setup modal until we know user data
        needsVaultUnlock: false,
        vaultReady: false,
        loading: true, // Add loading state
      };
    }

    // Server-side vault configuration status
    const vaultConfigured = user.hasSecuritySetup || false;
    
    // Client-side master key loaded status
    const masterKeyLoaded = hasMasterKey();

    // Derived states
    const needsVaultSetup = !vaultConfigured;
    const needsVaultUnlock = vaultConfigured && !masterKeyLoaded;
    const vaultReady = vaultConfigured && masterKeyLoaded;

    return {
      vaultConfigured,
      masterKeyLoaded,
      needsVaultSetup,
      needsVaultUnlock,
      vaultReady,
      loading: false,
    };
  }, [user, hasMasterKey]);

  return vaultState;
};
