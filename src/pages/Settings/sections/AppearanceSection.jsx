import { useTranslation } from 'react-i18next';
import { useTheme, THEME_MODES } from '../../../context/ThemeContext';
import { SUPPORTED_LANGUAGES } from '../../../i18n';

// Icons for theme options
const SunIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

const MoonIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
    />
  </svg>
);

const SystemIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

const AppearanceSection = () => {
  const { t, i18n } = useTranslation('settings');
  const { themeMode, setTheme } = useTheme();
  const currentLanguage = i18n.language;

  const themeOptions = [
    { id: THEME_MODES.LIGHT, icon: SunIcon, label: t('theme.light') },
    { id: THEME_MODES.DARK, icon: MoonIcon, label: t('theme.dark') },
    { id: THEME_MODES.SYSTEM, icon: SystemIcon, label: t('theme.system') },
  ];

  const languageOptions = Object.entries(SUPPORTED_LANGUAGES).map(
    ([code, lang]) => ({
      code,
      name: lang.name,
      nativeName: lang.nativeName,
    })
  );

  return (
    <div className="space-y-6">
      {/* Theme Selection Card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {t('theme.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('theme.description')}
        </p>

        <div className="grid grid-cols-3 gap-4">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = themeMode === option.id;
            return (
              <button
                key={option.id}
                onClick={() => setTheme(option.id)}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200
                  ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-900 hover:border-gray-300 dark:hover:border-zinc-500'
                  }
                `}
              >
                <div
                  className={`p-3 rounded-full ${
                    isSelected
                      ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                      : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Icon />
                </div>
                <span
                  className={`text-sm font-medium ${
                    isSelected
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {option.label}
                </span>
                {isSelected && (
                  <div className="absolute top-2 right-2 text-primary-500">
                    <CheckIcon />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Language Selection Card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {t('language.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('language.description')}
        </p>

        <div className="space-y-2">
          {languageOptions.map((lang) => {
            const isSelected = currentLanguage === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200
                  ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-900 hover:border-gray-300 dark:hover:border-zinc-500'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-medium ${
                      isSelected
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {lang.nativeName}
                  </span>
                  {lang.name !== lang.nativeName && (
                    <span className="text-sm text-gray-400 dark:text-gray-500">
                      ({lang.name})
                    </span>
                  )}
                </div>
                {isSelected && (
                  <div className="text-primary-500">
                    <CheckIcon />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AppearanceSection;
