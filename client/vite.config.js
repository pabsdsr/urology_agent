import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'   // ✅ import path

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // ✅ tell vite to treat @ as /src
    },
  },
})
