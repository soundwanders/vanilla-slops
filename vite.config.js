import { defineConfig } from 'vite';

export default defineConfig({
  root: './src/client',
  
  server: {
    port: 3000,
    open: true,
    // The server-rendered routes must be proxied to Express, not handled by
    // Vite. Vite's SPA fallback answers any unmatched path with index.html, so
    // an unproxied /how-it-works silently renders the home screen in dev while
    // working correctly in production (where vercel.json rewrites it to the
    // serverless function). Keep this list in sync with vercel.json's rewrites.
    proxy: {
      '/api': 'http://localhost:8000',
      '^/game/': 'http://localhost:8000',
      '/how-it-works': 'http://localhost:8000',
      '/sitemap.xml': 'http://localhost:8000',
      // The server-rendered pages link the *built* hashed bundle, which they
      // read out of dist/index.html. Vite dev serves source (styles/main.css)
      // and has nothing at /assets, so without this the SEO pages arrive
      // unstyled in dev while being fine in prod. Safe to proxy: /assets only
      // exists in the build output — there is no src/client/public/assets.
      // Note this serves the last `npm run build` CSS, so it will not hot-reload.
      '/assets': 'http://localhost:8000',
    },
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
  
  esbuild: {
    // Remove console.log in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
});