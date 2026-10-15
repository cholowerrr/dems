import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sends API calls to the backend so cookies work without CORS problems.
const api = { target: 'http://localhost:3000', changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { ...api, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
