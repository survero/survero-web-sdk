import { Survero } from './survero';

/**
 * `<script>` build: `window.Survero`. With `data-key` it starts on its own:
 * `<script src="https://cdn.jsdelivr.net/npm/@survero/web@0/dist/survero.js" data-key="pk_live_…" defer></script>`
 */
const script = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null;
const key = script?.dataset['key'];
if (key) Survero.init({ apiKey: key, ...(script?.dataset['baseUrl'] ? { baseUrl: script.dataset['baseUrl'] } : {}) });

export default Survero;
