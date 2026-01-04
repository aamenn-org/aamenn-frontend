const GridSizeControl = ({ size, onSizeChange }) => {
  const sizes = [
    { value: 'small', icon: 'S', label: 'Small' },
    { value: 'medium', icon: 'M', label: 'Medium' },
    { value: 'large', icon: 'L', label: 'Large' },
  ];

  return (
    <div className="flex items-center space-x-1 bg-gray-100 dark:bg-zinc-800 p-1">
      {sizes.map((s) => (
        <button
          key={s.value}
          onClick={() => onSizeChange(s.value)}
          className={`
            px-3 py-1.5 text-xs font-medium transition-all
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
