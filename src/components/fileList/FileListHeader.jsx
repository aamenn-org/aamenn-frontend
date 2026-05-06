import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';

const SortIcon = ({ column, sortKey, sortDir }) => {
  if (sortKey !== column) {
    return (
      <span className="ml-1 opacity-30 text-[10px]">
        <FontAwesomeIcon icon={faChevronUp} />
      </span>
    );
  }
  return (
    <span className="ml-1 opacity-80 text-[10px]">
      <FontAwesomeIcon icon={sortDir === 'asc' ? faChevronUp : faChevronDown} />
    </span>
  );
};

const FileListHeader = ({ sortKey, sortDir, onSort, hasCheckbox = true }) => {
  const headerCell = (label, key, extraClass = '') => (
    <button
      onClick={() => onSort(key)}
      className={`flex items-center gap-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-200 transition-colors select-none ${extraClass}`}
    >
      {label}
      <SortIcon column={key} sortKey={sortKey} sortDir={sortDir} />
    </button>
  );

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/60 sticky top-0 z-10">
      {hasCheckbox && <div className="w-5 flex-shrink-0" />}
      {/* Icon placeholder */}
      <div className="w-6 flex-shrink-0" />
      {/* Name */}
      <div className="flex-1 min-w-0">
        {headerCell('Name', 'name')}
      </div>
      {/* Type */}
      <div className="w-28 flex-shrink-0 hidden md:block">
        {headerCell('Type', 'type')}
      </div>
      {/* Size */}
      <div className="w-24 flex-shrink-0 hidden sm:block">
        {headerCell('Size', 'size', 'justify-end w-full')}
      </div>
      {/* Modified */}
      <div className="w-40 flex-shrink-0 hidden md:block">
        {headerCell('Modified', 'modified', 'justify-end w-full')}
      </div>
    </div>
  );
};

export default FileListHeader;
