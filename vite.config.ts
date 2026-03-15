import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-icon-192.png', 'logo-icon-512.png', 'logo-favicon-64.png'],
      manifest: {
        id: '/',
        name: 'Na7 Chat',
        short_name: 'Na7 Chat',
        description: 'Run AI models locally in your browser — no server, no API keys',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#050505',
        theme_color: '#050505',
        icons: [
          { src: '/logo-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo-icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/logo-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Allow large model shard files to be cached
        maximumFileSizeToCacheInBytes: 150 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          // App shell documents/scripts/styles
          {
            urlPattern: ({ request }) =>
              request.mode === 'navigate' || ['script', 'style', 'worker'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-shell-v2',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          // Static media/icons/fonts
          {
            urlPattern: ({ request }) => ['image', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-v2',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // App metadata
          {
            urlPattern: ({ url }) =>
              /manifest\.webmanifest$/i.test(url.pathname) || /\/models\/.*/i.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'metadata-v2',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Model weight files (.bin, .onnx, .gguf)
          {
            urlPattern: /\.bin$|\.gguf$|\.onnx$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'model-weights-v2',
              rangeRequests: true,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Hugging Face CDN files (tokenizers, configs, model shards)
          {
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hf-files-v2',
              rangeRequests: true,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hf-cdn-v2',
              rangeRequests: true,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // MLC / GitHub raw model files
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mlc-model-files-v2',
              rangeRequests: true,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  // web-llm uses top-level await — exclude from Vite pre-bundling
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'],
  },
  // Workers must be ES modules so they can use dynamic import()
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by WASM/ONNX backends)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
