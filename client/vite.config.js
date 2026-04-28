import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'deep-chat',
        },
      },
    }),
  ],
  server: {
    proxy: {
      // VITE_PROXY_TARGET lets E2E point Vite at the E2E server port so it
      // can run alongside a normal dev stack on 3001/5173.
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
      // Marketing admin suite is mounted on the Express server at
      // /admin/marketing — proxy the whole subtree so
      // http://localhost:5173/admin/marketing works during dev. The suite
      // owns its own SPA + API + SSE.
      '/admin/marketing': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
        ws: true,
      },
    },
  },
})
