import { defineConfig } from 'vite';

export default defineConfig({
  root: './src/client',
  server: {
    port: 3000, 
    open: true, 
  },
  build: {
    outDir: './src/client/dist', 
    emptyOutDir: true,
  },
});