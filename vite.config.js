import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Mirrors production, where /api/* is served by Vercel functions
    // instead of the SPA rewrite.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
