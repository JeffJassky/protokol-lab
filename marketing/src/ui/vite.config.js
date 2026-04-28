import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [vue()],
  // Built bundle is served from {basePath}/assets/* by the Express router.
  // basePath itself is determined at runtime, so use a relative base for
  // assets — index.html ends up portable.
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../ui-dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5180,
  },
});
