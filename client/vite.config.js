// vite.config.js — proxies /api requests to the Express server during dev
// so the frontend never has to include the full localhost:4000 URL in fetch calls.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Any request starting with /api is forwarded to the Express server.
      '/api': 'http://localhost:4000',
    },
  },
});
