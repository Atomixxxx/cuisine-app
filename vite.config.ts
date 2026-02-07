import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.svg', 'icons/icon-512.svg', 'icons/icon-maskable.svg'],
      manifest: {
        id: '/',
        name: 'CuisineControl - Assistant Cuisine',
        short_name: 'CuisineControl',
        description: 'Assistant HACCP personnel pour la cuisine pro',
        theme_color: '#2997FF',
        background_color: '#f7f4ee',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/dashboard',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Saisie temperatures',
            short_name: 'Temperatures',
            description: 'Saisir rapidement les releves',
            url: '/temperature?quick=input',
          },
          {
            name: 'Scanner un produit',
            short_name: 'Scan produit',
            description: 'Ouvrir le scanner tracabilite',
            url: '/traceability?tab=scanner&quick=scan',
          },
          {
            name: 'Scanner une facture',
            short_name: 'Scan facture',
            description: 'Ouvrir le scan facture',
            url: '/invoices?quick=scan',
          },
          {
            name: 'Nouvelle tache',
            short_name: 'Tache',
            description: 'Ajouter une tache en un geste',
            url: '/tasks?quick=new',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { '@': '/src' }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  }
})
