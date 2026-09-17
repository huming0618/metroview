import { defineConfig } from 'vite';

// GitHub Pages project site: https://huming0618.github.io/metroview/
export default defineConfig({
  base: process.env.VITE_BASE || '/metroview/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
