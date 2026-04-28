import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Source-map upload runs only when SENTRY_AUTH_TOKEN is set in the build
// environment. Local `npm run build` without the token still works — the
// plugin no-ops (its `disable` flag) so devs without Sentry credentials
// don't get a build failure. CI and prod-deploy hosts set the token.
const sentryEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN)

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'deep-chat',
        },
      },
    }),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG || 'jeff-jassky',
      project: process.env.SENTRY_PROJECT || 'protokollab-client',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.SENTRY_RELEASE || undefined },
      disable: !sentryEnabled,
      telemetry: false,
    }),
  ],
  // Source maps generated when Sentry upload is enabled. 'hidden' emits
  // the .map files but omits the //# sourceMappingURL comment from the
  // bundled JS — even if the Sentry plugin's post-upload cleanup fails
  // partway and the maps stay in dist/, browsers won't fetch them, so
  // prod minified code stays opaque to casual readers.
  build: {
    sourcemap: sentryEnabled ? 'hidden' : false,
  },
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
