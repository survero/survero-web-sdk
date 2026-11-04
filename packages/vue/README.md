# @survero/vue

[Survero](https://www.npmjs.com/package/@survero/web) for Vue 3 and Nuxt: product events, identity and in-app
micro-surveys. Re-exports everything from `@survero/web`.

> **Using an AI agent?** `npx survero init` sets this up for you.

```bash
npm install @survero/vue
```

## Vue (Vite)

```ts
// main.ts
import { SurveroPlugin } from '@survero/vue';

createApp(App).use(SurveroPlugin, { apiKey: import.meta.env.VITE_SURVERO_KEY }).mount('#app');
```

```vue
<script setup lang="ts">
import { useSurvero } from '@survero/vue';
const survero = useSurvero();
</script>

<template>
  <button @click="survero.track('checkout_completed', { total: 42 })">Pay</button>
</template>
```

In templates, `$survero` works too.

## Nuxt

```ts
// plugins/survero.client.ts
import { SurveroPlugin } from '@survero/vue';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(SurveroPlugin, { apiKey: useRuntimeConfig().public.surveroKey as string });
});
```

```ts
// nuxt.config.ts — set NUXT_PUBLIC_SURVERO_KEY=pk_live_… in .env
export default defineNuxtConfig({ runtimeConfig: { public: { surveroKey: '' } } });
```

Page views are tracked automatically on every route change (`$screen`). On the server every call is a no-op.

Surveys, options, sinks and behavior: see [`@survero/web`](https://www.npmjs.com/package/@survero/web).
