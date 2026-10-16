import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  cacheDir: '/tmp/vite-cache',
  server: { host: '127.0.0.1', hmr: false },
  build: { outDir: '/tmp/build', emptyOutDir: true }
})
