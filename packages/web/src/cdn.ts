import { Survero } from './survero';

/**
 * Build para `<script>`: `window.Survero`. Con `data-key` se inicializa solo:
 * `<script src="https://cdn.survero.com/web@0/survero.js" data-key="pk_live_…" defer></script>`
 */
const script = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null;
const key = script?.dataset['key'];
if (key) Survero.init({ apiKey: key, ...(script?.dataset['baseUrl'] ? { baseUrl: script.dataset['baseUrl'] } : {}) });

export default Survero;
