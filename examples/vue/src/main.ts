import { SurveroPlugin } from '@survero/vue';
import { createApp } from 'vue';
import App from './App.vue';

// La clave PÚBLICA en una variable pública (Vite: VITE_*, Nuxt: runtimeConfig.public). Pruebas: ?key=…&api=…
const params = new URLSearchParams(location.search);
const api = params.get('api') ?? import.meta.env.VITE_SURVERO_API_URL;

createApp(App)
  .use(SurveroPlugin, {
    apiKey: params.get('key') ?? import.meta.env.VITE_SURVERO_KEY ?? 'pk_live_REPLACE_ME',
    ...(api ? { baseUrl: api } : {}),
  })
  .mount('#app');
