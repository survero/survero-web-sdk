// Presupuesto de tamaño (gzip): núcleo < 12 kB, adaptadores < 1 kB.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budget = { web: 12_000, react: 1_000, vue: 1_000, svelte: 1_000, angular: 1_000 };
let failed = false;
for (const [pkg, max] of Object.entries(budget)) {
  const file = pkg === 'web' ? 'packages/web/dist/survero.js' : `packages/${pkg}/dist/index.js`;
  const size = gzipSync(readFileSync(file)).length;
  const ok = size <= max;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} @survero/${pkg.padEnd(8)} ${String(size).padStart(6)} B gzip (max ${max})`);
}
process.exit(failed ? 1 : 0);
