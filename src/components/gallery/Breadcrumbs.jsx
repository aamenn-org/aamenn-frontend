import { useState, useEffect } from 'react';
import { useAuth } from '../../context';
import { decryptFilename } from '../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faChevronRight } from '@fortawesome/free-solid-svg-icons';

const Breadcrumbs = ({ breadcrumbs = [], onNavigate, onDropOnBreadcrumb }) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const [decryptedCrumbs, setDecryptedCrumbs] = useState([]);
  const [dragOverId, setDragOverId] = useState(null); // null = home, folderId = folder crumb

  useEffect(() => {
    const decrypt = async () => {
      if (!hasMasterKey() || breadcrumbs.length === 0) {
        setDecryptedCrumbs([]);
        return;
      }
      const masterKey = getMasterKey();
      const results = await Promise.all(
        breadcrumbs.map(async (crumb) => {
          try {
            const name = await decryptFilename(crumb.nameEncrypted, masterKey);
            return { ...crumb, name };
          } catch {
            return { ...crumb, name: 'Encrypted' };
          }
        })
      );
      setDecryptedCrumbs(results);
    };
    decrypt();
  }, [breadcrumbs, getMasterKey, hasMasterKey]);

  const dragProps = (id) => ({
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setDragOverId(id);
    },
    onDragLeave: (e) => {
      e.preventDefault();
      setDragOverId(null);
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverId(null);
      onDropOnBreadcrumb?.(id);
    },
  });

  const dropHighlight = (id) =>
    dragOverId === id
      ? 'ring-blue-100'
      : '';

  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide pb-1">
      <button
        onClick={() => onNavigate?.(null)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-gray-600 dark:text-gray-300 transition-colors whitespace-nowrap flex-shrink-0 hover:bg-gray-100 dark:hover:bg-zinc-800 ${dropHighlight(null)}`}
        {...dragProps(null)}
      >
        <FontAwesomeIcon icon={faHome} className="w-3.5 h-3.5" />
        <span>Home</span>
      </button>

      {decryptedCrumbs.map((crumb, index) => {
        const isLast = index === decryptedCrumbs.length - 1;
        return (
          <div key={crumb.folderId} className="flex items-center gap-1 flex-shrink-0">
            <FontAwesomeIcon
              icon={faChevronRight}
              className="w-2.5 h-2.5 text-gray-400 dark:text-gray-500"
            />
            <button
              onClick={() => !isLast && onNavigate?.(crumb.folderId)}
              className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                isLast
                  ? 'text-gray-900 dark:text-white font-medium cursor-default'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
              } ${dropHighlight(crumb.folderId)}`}
              disabled={isLast}
              {...dragProps(crumb.folderId)}
            >
              {crumb.name}
            </button>
          </div>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
