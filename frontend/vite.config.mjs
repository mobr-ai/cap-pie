import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import compression from 'vite-plugin-compression';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_'); // only expose VITE_* vars

    const isProd = mode === 'production';

    return {
        plugins: [
            react(),
            wasm(),
            // Brotli compress build assets >10kb
            compression({
                algorithm: 'brotliCompress',
                ext: '.br',
                deleteOriginFile: false,
                threshold: 10 * 1024
            })
        ],

        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                components: path.resolve(__dirname, './src/components'),
                styles: path.resolve(__dirname, './src/styles'),
                locales: path.resolve(__dirname, './src/locales'),
                assets: path.resolve(__dirname, './src/assets'),
                buffer: 'buffer'
            }
        },

        define: {
            // some libs still read these; safe empty shims for browser
            global: {},
            // 'process.env': {},
        },

        optimizeDeps: {
            include: ['react', 'react-dom', 'buffer'],
            esbuildOptions: {
                define: {
                    global: 'globalThis'
                }
            }
        },

        build: {
            target: 'esnext',
            outDir: 'dist',
            sourcemap: !isProd, // dev/preview sourcemaps only
            assetsInlineLimit: 0,
            chunkSizeWarningLimit: 900,
            rollupOptions: {
                output: {
                    manualChunks: {
                        react: ['react', 'react-dom'],
                        bootstrap: ['react-bootstrap'],
                        i18n: ['i18next', 'react-i18next'],
                    }
                }
            }
        },

        server: {
            // Avoid conflict with FastAPI on :8000
            port: Number(env.VITE_DEV_PORT || 5173),
            open: true,
            strictPort: true,
            headers: {
                // Helpful for local auth cookies over different ports
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp'
            },
            proxy: {
                // Forward API/auth to FastAPI backend
                '/api': {
                    target: env.VITE_API_BASE || 'http://localhost:8000',
                    changeOrigin: true,
                    secure: false
                },
                '/auth': {
                    target: env.VITE_API_BASE || 'http://localhost:8000',
                    changeOrigin: true,
                    secure: false
                }
            }
        },

        preview: {
            port: Number(env.VITE_PREVIEW_PORT || 4173),
            strictPort: true
        },

        // If  WASM workers or cross-origin isolation are required later,
        // consider plugins for workers or set headers at reverse proxy.
    };
});
