import { useTranslation } from 'react-i18next';

const GridSizeControl = ({ size, onSizeChange }) => {
  const { t } = useTranslation('photos');
  
  const sizes = [
    { value: 'small', icon: 'S', label: t('gridSize.small', 'Small') },
    { value: 'medium', icon: 'M', label: t('gridSize.medium', 'Medium') },
    { value: 'large', icon: 'L', label: t('gridSize.large', 'Large') },
  ];

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 p-0.5 sm:p-1 rounded">
      {sizes.map((s) => (
        <button
          key={s.value}
          onClick={() => onSizeChange(s.value)}
          className={`
            px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-medium transition-all rounded
            ${
              size === s.value
                ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
          title={s.label}
        >
          {s.icon}
        </button>
      ))}
    </div>
  );
};

export default GridSizeControl;
