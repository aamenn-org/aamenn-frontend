import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

const SyncingIndicator = ({ isSyncing }) => {
  if (!isSyncing) return null;

  return (
    <div className="flex items-center justify-center py-4 text-gray-400">
      <FontAwesomeIcon icon={faSpinner} className="animate-spin w-4 h-4 mr-2" />
      <span className="text-sm">Syncing gallery...</span>
    </div>
  );
};

export default SyncingIndicator;
