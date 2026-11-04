import { defineConfig } from 'vite';

// Sirve el build IIFE del núcleo (packages/web/dist/survero.js) como /survero.js.
export default defineConfig({ publicDir: '../../packages/web/dist', server: { port: 5101, strictPort: true } });
