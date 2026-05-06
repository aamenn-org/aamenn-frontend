import { useEffect } from 'react';

function getIsAuthenticated() {
  return !!(
    localStorage.getItem('accessToken') ||
    sessionStorage.getItem('accessToken')
  );
}

export default function AuthStatusBridge() {
  useEffect(() => {
    const postStatus = () => {
      window.parent.postMessage(
        {
          type: 'AAMENN_AUTH_STATUS',
          isAuthenticated: getIsAuthenticated(),
        },
        '*'
      );
    };

    postStatus();

    const interval = setInterval(postStatus, 5000);
    window.addEventListener('storage', postStatus);
    window.addEventListener('focus', postStatus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', postStatus);
      window.removeEventListener('focus', postStatus);
    };
  }, []);

  return null;
}
