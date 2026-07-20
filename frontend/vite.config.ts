import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3004,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/sessions': {
        target: 'http://localhost:3003',
      },
    },
  },
})
