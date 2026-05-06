import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';

const DashboardFooter = () => {
  return (
    <footer className="bg-white border-t border-gray-100 py-4 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <FontAwesomeIcon icon={faHeart} className="w-4 h-4" />
            <span> 2023 Aamenn. Privacy First.</span>
          </div>
          <div className="flex items-center space-x-6">
            <Link
              to="/privacy-policy"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              to="/terms"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              to="/help"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Help
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DashboardFooter;
