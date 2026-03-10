import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

const Button = ({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  className = '',
  onClick,
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center
    font-semibold rounded-lg
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-zinc-900
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variants = {
    primary: `
      bg-primary-500 text-white
      hover:bg-primary-600
      focus:ring-primary-500
    `,
    secondary: `
      bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-200
      hover:bg-gray-200 dark:hover:bg-zinc-600
      focus:ring-gray-500
    `,
    outline: `
      border-2 border-gray-200 dark:border-zinc-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800
      hover:border-gray-300 dark:hover:border-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-700
      focus:ring-gray-500
    `,
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${baseStyles}
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <FontAwesomeIcon icon={faSpinner} className="animate-spin -ml-1 mr-2 h-4 w-4" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
