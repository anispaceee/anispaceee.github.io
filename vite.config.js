import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteOAuthPlugin from './vite-plugin-oauth.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteOAuthPlugin()],
  base: '/',
  build: {
    outDir: 'dist',
  },
})
