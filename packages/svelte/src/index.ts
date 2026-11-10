import { Survero, type SurveroInstance, type SurveroOptions } from '@survero/web';
import { getContext, setContext } from 'svelte';

export * from '@survero/web';

const KEY = Symbol('survero');

/**
 * Call once in the root component's `<script>` (in SvelteKit, `src/routes/+layout.svelte`):
 * `initSurvero({ apiKey: import.meta.env.VITE_SURVERO_KEY })`. It does nothing on the server; it starts on hydration.
 */
export function initSurvero(options: SurveroOptions): SurveroInstance {
  Survero.init(options);
  setContext(KEY, Survero);
  return Survero;
}

/** La instancia de Survero en cualquier componente. */
export function getSurvero(): SurveroInstance {
  return getContext<SurveroInstance | undefined>(KEY) ?? Survero;
}
