import { defineConfig } from 'vite';

export default defineConfig({
  root: './src/client',
  server: {
    port: 3000, 
    open: true, 
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
});