import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In production Caddy serves /api from the same origin, so the app always
// calls a relative /api path. In dev, forward it to the local API (or to
// another host via DUETTE_API_TARGET) to keep those paths working.
const apiTarget = process.env.DUETTE_API_TARGET ?? 'http://127.0.0.1:8790'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
})
