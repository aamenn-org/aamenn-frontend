// API Configuration
const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const config = {
  apiUrl: API_BASE_URL,
  appName: 'Aamenn',
  googleClientId: GOOGLE_CLIENT_ID,
};

export default config;
