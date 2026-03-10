import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
  },
});
