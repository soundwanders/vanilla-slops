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
    
    // Enable minification and tree shaking
    minify: 'terser',
    
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 500,
    
    rollupOptions: {
      output: {
        // Efficient chunking strategy
        manualChunks: {
          vendor: ['@supabase/supabase-js'],
        },
        
        // Content-based hashing for cache busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    
    target: 'esnext', // Modern browsers only
    sourcemap: false, // Disable sourcemaps in production
    
    // CSS optimization
    cssCodeSplit: true,
  },
  
  // Only expose necessary environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  
  resolve: {
    extensions: ['.js', '.mjs', '.json'],
  },
  
  // Pre-bundle heavy dependencies
  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
  
  esbuild: {
    // Remove console.log in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
});