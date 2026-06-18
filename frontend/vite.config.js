import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // In dev mode, proxy API requests to the backend so the frontend can
      // use relative URLs (same baseURL as in production single-process mode).
      '/emails': 'http://localhost:8000',
      '/accounts': 'http://localhost:8000',
      '/sync': 'http://localhost:8000',
      '/triage': 'http://localhost:8000',
      '/settings': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
