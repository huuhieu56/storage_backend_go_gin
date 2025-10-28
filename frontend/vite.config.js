import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy /api requests to storage-backend for local development
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying:', req.method, req.url, '->', options.target + req.url.replace(/^\/api/, ''))
          })
        }
      },
      // Proxy /videos and /materials to nginx (if running locally)
      '/videos': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/materials': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      }
    }
  }
})
