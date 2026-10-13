import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ],
  // Every React-using dependency is pre-bundled up front. If one is discovered
  // late, Vite re-optimizes mid-load and the page ends up holding two dependency
  // builds at once — two copies of React, which makes hooks read from a null
  // React and stops the app from mounting.
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
});