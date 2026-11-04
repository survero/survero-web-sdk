import { Survero, type SurveroInstance, type SurveroOptions } from '@survero/web';
import { getContext, setContext } from 'svelte';

export * from '@survero/web';

const KEY = Symbol('survero');

/**
 * Llamar una vez en el `<script>` del componente raíz (en SvelteKit, `src/routes/+layout.svelte`):
 * `initSurvero({ apiKey: PUBLIC_SURVERO_KEY })`. En el servidor no hace nada; al hidratar, inicializa.
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
