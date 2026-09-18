import { defineConfig } from 'vite';

// GitHub Pages: /metroview/; Capacitor / offline: VITE_BASE=./
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
