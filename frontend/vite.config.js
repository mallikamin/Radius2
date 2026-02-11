import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://api:8000',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy PDF libraries into their own chunk (~2MB)
          'vendor-pdf': ['jspdf', 'pdfjs-dist'],
          // Split Excel library into its own chunk (~1MB)
          'vendor-excel': ['xlsx'],
        }
      }
    }
  }
})
