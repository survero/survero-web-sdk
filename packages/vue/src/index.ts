import { Survero, type SurveroInstance, type SurveroOptions } from '@survero/web';
import { inject, type App, type InjectionKey } from 'vue';

export * from '@survero/web';

const KEY: InjectionKey<SurveroInstance> = Symbol('survero');

/**
 * `app.use(SurveroPlugin, { apiKey: import.meta.env.VITE_SURVERO_KEY })`. In Nuxt, in a `.client.ts` plugin:
 * `defineNuxtPlugin((nuxt) => nuxt.vueApp.use(SurveroPlugin, { apiKey: useRuntimeConfig().public.surveroKey }))`.
 */
export const SurveroPlugin = {
  install(app: App, options: SurveroOptions) {
    Survero.init(options); // en el servidor (SSR) es un no-op
    app.provide(KEY, Survero);
    app.config.globalProperties['$survero'] = Survero;
  },
};

/** The Survero instance, inside `setup()`. */
export function useSurvero(): SurveroInstance {
  return inject(KEY, Survero);
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $survero: SurveroInstance;
  }
}
