import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Necessary for Docker networking
    port: 3000,      // Matches the updated Nginx proxy_pass
    strictPort: true // Prevents Vite from trying another port if 5173 is busy
  }
})
