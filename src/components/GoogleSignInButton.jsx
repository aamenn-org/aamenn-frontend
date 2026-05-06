import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context';

/**
 * GoogleSignInButton - Handles Google OAuth sign-in flow
 * 
 * @param {function} onSuccess - Callback with result when sign-in succeeds
 * @param {function} onError - Callback with error message when sign-in fails
 */
export const GoogleSignInButton = ({ onSuccess, onError }) => {
  const { loginWithGoogle } = useAuth();

  const handleSuccess = async (credentialResponse) => {
    try {
      const result = await loginWithGoogle(credentialResponse.credential);
      if (result.success) {
        onSuccess?.(result);
      } else {
        onError?.(result.error || 'Google login failed');
      }
    } catch (error) {
      onError?.(error.message || 'Google login failed');
    }
  };

  const handleError = () => {
    console.error('Google login error');
    onError?.('Google login failed');
  };

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        useOneTap={false}
        text="continue_with"
        shape="rectangular"
        size="large"
        width="100%"
      />
    </div>
  );
};

export default GoogleSignInButton;
