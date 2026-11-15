import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/pixova-games/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/pixova-games/',
        name: 'Pixova Games',
        short_name: 'Pixova',
        description: 'Quick multiplayer party games for your phone. No signup.',
        start_url: '/pixova-games/',
        scope: '/pixova-games/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#16122e',
        theme_color: '#16122e',
        categories: ['games', 'entertainment'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell, images and short sound effects are precached; music is cached on first play.
        globPatterns: ['**/*.{js,css,html,png,webp,svg,ico}', '**/*-sfx-*.mp3'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.mp3'),
            handler: 'CacheFirst',
            options: { cacheName: 'pixova-audio', expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // tag sound effects so the service worker can precache them while music stays lazy
        assetFileNames: (info) => {
          const n = info.names?.[0] ?? '';
          if (n.endsWith('.mp3') && !/music|lobby/.test(n)) return 'assets/[name]-sfx-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  test: { environment: 'node' },
} as any);
