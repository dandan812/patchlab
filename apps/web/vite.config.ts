import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../../packages/shared', import.meta.url)),
        fileURLToPath(new URL('../../node_modules', import.meta.url))
      ],
      deny: [
        '.env',
        '.env.*',
        '**/data/**',
        '**/fixtures/**',
        '**/packages/evaluator/**',
        '**/.git/**',
        '*.{crt,pem}'
      ]
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.PATCHLAB_PORT || '4310'}`,
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist/web', import.meta.url)),
    emptyOutDir: true
  }
})
