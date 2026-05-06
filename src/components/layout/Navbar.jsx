import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faBars } from '@fortawesome/free-solid-svg-icons';

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#1F2B8F] border-b border-blue-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={faImage} className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white aref-ruqaa-bold">Aamenn</span>
            <span className="text-xs text-blue-100 font-medium changa-regular">حَل</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/about"
              className="text-blue-100 hover:text-white text-sm font-medium changa-regular transition-colors"
            >
              About
            </Link>
            <Link
              to="/privacy"
              className="text-blue-100 hover:text-white text-sm font-medium changa-regular transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/login"
              className="text-white hover:text-blue-100 text-sm font-semibold changa-semibold transition-colors"
            >
              Log In
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button className="text-blue-100 hover:text-white">
              <FontAwesomeIcon icon={faBars} className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
