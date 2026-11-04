<script lang="ts">
  import { initSurvero } from '@survero/svelte';
  import Shop from './Shop.svelte';

  // Una vez en el componente raíz (SvelteKit: src/routes/+layout.svelte, con PUBLIC_SURVERO_KEY de $env/static/public).
  // Pruebas: ?key=…&api=…
  const params = new URLSearchParams(location.search);
  const api = params.get('api') ?? import.meta.env.VITE_SURVERO_API_URL;
  initSurvero({
    apiKey: params.get('key') ?? import.meta.env.VITE_SURVERO_KEY ?? 'pk_live_REPLACE_ME',
    ...(api ? { baseUrl: api } : {}),
  });
</script>

<Shop />
