import { defineConfig } from 'tsup';

export default defineConfig([
  { entry: ['src/index.ts'], format: ['esm', 'cjs'], dts: true, clean: true, minify: true, sourcemap: true, target: 'es2020' },
  // <script> / CDN: window.Survero
  {
    entry: { survero: 'src/cdn.ts' },
    format: ['iife'],
    globalName: 'Survero',
    minify: true,
    target: 'es2020',
    outExtension: () => ({ js: '.js' }),
    footer: { js: 'Survero=Survero.default;' },
  },
]);
