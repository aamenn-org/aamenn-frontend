import { useTranslation } from 'react-i18next';
import { useTheme, THEME_MODES } from '../../../context/ThemeContext';
import { SUPPORTED_LANGUAGES } from '../../../i18n';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSun, 
  faMoon, 
  faDesktop, 
  faCheck 
} from '@fortawesome/free-solid-svg-icons';

const AppearanceSection = () => {
  const { t, i18n } = useTranslation('settings');
  const { themeMode, setTheme } = useTheme();
  const currentLanguage = i18n.language;

  const themeOptions = [
    { id: THEME_MODES.LIGHT, icon: faSun, label: t('theme.light') },
    { id: THEME_MODES.DARK, icon: faMoon, label: t('theme.dark') },
    { id: THEME_MODES.SYSTEM, icon: faDesktop, label: t('theme.system') },
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
                  <FontAwesomeIcon icon={option.icon} className="w-5 h-5" />
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
                    <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
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
                    <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
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
