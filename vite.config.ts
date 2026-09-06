import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
  ],
  server: {
    /**
     * HMR Configuration — ensures client state (auth, gallery, uploads) survives
     * hot module replacement during development.
     *
     * The goal: when you edit src/components/darkroom/UndevelopedRoll.tsx,
     * only that component's geometry updates; parent gallery state, Supabase
     * session, API queries, and upload queue remain untouched.
     */
    hmr: {
      // HMR protocol (use wss for secure, ws for local dev)
      protocol: 'ws',
      // Use localhost for local development; adjust for remote dev environments
      host: 'localhost',
      // Port 5173 is Vite's default; change if running multiple projects
      port: 5173,
    },
    /**
     * Middleware delay for HMR — gives the browser time to settle
     * between module reloads. Reduces cases where parent state flushes.
     */
    middlewareMode: false,
  },

  /**
   * Optimize build performance and CSS containment
   */
  build: {
    // Split vendor chunks so node_modules updates don't break the world
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendors into their own bundles
          vendor: ['react', 'react-dom'],
          // Keep darkroom primitives isolated so they update independently
          darkroom: ['src/components/darkroom/index.ts'],
        },
      },
    },
    // Generate sourcemaps for debugging (can be disabled in prod)
    sourcemap: true,
    // CSS extraction for cleaner debugging
    cssCodeSplit: true,
  },

  resolve: {
    /**
     * Alias for cleaner imports in deep component hierarchies.
     * Allows: import { UndevelopedRoll } from '@/components/darkroom'
     * Instead of: import { UndevelopedRoll } from '../../../../components/darkroom'
     */
    alias: {
      '@': '/src',
    },
  },
})


