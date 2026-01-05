import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import all translations
import enCommon from './locales/en/common.json';
import enSettings from './locales/en/settings.json';
import enDashboard from './locales/en/dashboard.json';
import enAlbums from './locales/en/albums.json';

import arCommon from './locales/ar/common.json';
import arSettings from './locales/ar/settings.json';
import arDashboard from './locales/ar/dashboard.json';
import arAlbums from './locales/ar/albums.json';

// Supported languages configuration
export const SUPPORTED_LANGUAGES = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dir: 'ltr',
  },
  ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
  },
};

// Default language
export const DEFAULT_LANGUAGE = 'en';

// Get stored language or detect from browser
const getInitialLanguage = () => {
  // Check localStorage first
  const storedLang = localStorage.getItem('i18nextLng');
  if (storedLang && SUPPORTED_LANGUAGES[storedLang]) {
    return storedLang;
  }

  // Detect from browser
  const browserLang = navigator.language?.split('-')[0];
  if (browserLang && SUPPORTED_LANGUAGES[browserLang]) {
    return browserLang;
  }

  return DEFAULT_LANGUAGE;
};

// Bundle all resources
const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    dashboard: enDashboard,
    albums: enAlbums,
  },
  ar: {
    common: arCommon,
    settings: arSettings,
    dashboard: arDashboard,
    albums: arAlbums,
  },
};

// Initialize i18next
i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: ['common', 'settings', 'dashboard', 'albums'],

  interpolation: {
    escapeValue: false, // React already escapes by default
  },

  react: {
    useSuspense: false, // Set to true when using Suspense for lazy loading
  },

  // Debug mode in development
  debug: import.meta.env.DEV,
});

// Update document direction when language changes
i18n.on('languageChanged', (lng) => {
  const dir = SUPPORTED_LANGUAGES[lng]?.dir || 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
  localStorage.setItem('i18nextLng', lng);
});

// Set initial direction
const initialDir = SUPPORTED_LANGUAGES[i18n.language]?.dir || 'ltr';
document.documentElement.dir = initialDir;
document.documentElement.lang = i18n.language;

export default i18n;
