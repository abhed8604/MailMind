import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MailMind',
        short_name: 'MailMind',
        description: 'AI-powered email triage and management',
        theme_color: '#0e0e1a',
        background_color: '#0e0e1a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Network-first for API calls so data is always fresh while online.
        runtimeCaching: [
          {
            urlPattern: /^\/(emails|accounts|sync|triage|settings|health)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // In dev mode, proxy API requests to the backend so the frontend can
      // use relative URLs (same baseURL as in production single-process mode).
      '/emails': 'https://localhost:8000',
      '/accounts': 'https://localhost:8000',
      '/sync': 'https://localhost:8000',
      '/triage': 'https://localhost:8000',
      '/settings': 'https://localhost:8000',
      '/health': 'https://localhost:8000',
      // Trust self-signed cert from the backend
      secure: false,
    },
  },
})
