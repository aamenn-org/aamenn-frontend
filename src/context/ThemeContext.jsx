import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

const ThemeContext = createContext(null);

// Storage key for theme preference
const THEME_STORAGE_KEY = 'aamenn_theme';

// Theme modes
export const THEME_MODES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Get system preference
const getSystemPreference = () => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

export const ThemeProvider = ({ children }) => {
  // Initialize theme mode from localStorage (light, dark, or system)
  const [themeMode, setThemeMode] = useState(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && Object.values(THEME_MODES).includes(stored)) {
      return stored;
    }
    return THEME_MODES.SYSTEM;
  });

  // Track system preference for when mode is 'system'
  const [systemPreference, setSystemPreference] = useState(getSystemPreference);

  // Calculate effective theme (actual applied theme: light or dark)
  const effectiveTheme = useMemo(() => {
    if (themeMode === THEME_MODES.SYSTEM) {
      return systemPreference;
    }
    return themeMode;
  }, [themeMode, systemPreference]);

  const isDarkMode = effectiveTheme === 'dark';

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [effectiveTheme]);

  // Store preference whenever themeMode changes
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Toggle between light -> dark -> system -> light
  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      switch (prev) {
        case THEME_MODES.LIGHT:
          return THEME_MODES.DARK;
        case THEME_MODES.DARK:
          return THEME_MODES.SYSTEM;
        case THEME_MODES.SYSTEM:
          return THEME_MODES.LIGHT;
        default:
          return THEME_MODES.SYSTEM;
      }
    });
  }, []);

  // Set specific theme mode
  const setTheme = useCallback((mode) => {
    if (Object.values(THEME_MODES).includes(mode)) {
      setThemeMode(mode);
    }
  }, []);

  const value = useMemo(
    () => ({
      themeMode, // 'light' | 'dark' | 'system'
      theme: effectiveTheme, // 'light' | 'dark' (resolved)
      isDarkMode,
      toggleTheme,
      setTheme,
    }),
    [themeMode, effectiveTheme, isDarkMode, toggleTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export default ThemeContext;
