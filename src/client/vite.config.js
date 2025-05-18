import { defineConfig } from 'vite';

export default defineConfig({
  root: './src/client',
  base: './', 
  server: {
    port: 3000,
    open: true,   // Open browser on start
  },
  build: {
    outDir: 'src/client/dist', 
    emptyOutDir: true,
  },
});