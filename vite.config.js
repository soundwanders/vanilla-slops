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
      '/catalog': 'http://localhost:8000',
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

    // Terser is the minifier, so the console stripping has to be terser's, and
    // it has to live under `build` where Vite reads it. This was previously a
    // top-level `esbuild: { drop: ['console', 'debugger'] }` — an esbuild
    // option, and therefore inert while terser does the minifying: a
    // NODE_ENV=production build still shipped twelve console.log calls,
    // verified by grepping the bundle. The intent is kept and now actually runs.
    //
    // pure_funcs rather than drop_console, because console.error and
    // console.warn are real error paths — a failed fetch, a preload that gave
    // up — and should survive into production where a bug report can quote them.
    //
    // Unconditional: this block is only reached by `vite build`, so there is no
    // NODE_ENV branch left to get wrong.
    terserOptions: {
      compress: {
        pure_funcs: ['console.log', 'console.debug'],
      },
    },
    
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
  
});