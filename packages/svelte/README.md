# @survero/svelte

[Survero](https://www.npmjs.com/package/@survero/web) for Svelte 5 and SvelteKit: product events, identity and in-app
micro-surveys. Re-exports everything from `@survero/web`.

> **Using an AI agent?** `npx survero init` sets this up for you.

```bash
npm install @survero/svelte
```

## SvelteKit

```svelte
<!-- src/routes/+layout.svelte — PUBLIC_SURVERO_KEY=pk_live_… in .env -->
<script lang="ts">
  import { initSurvero } from '@survero/svelte';
  import { PUBLIC_SURVERO_KEY } from '$env/static/public';

  let { children } = $props();
  initSurvero({ apiKey: PUBLIC_SURVERO_KEY });
</script>

{@render children()}
```

```svelte
<script lang="ts">
  import { getSurvero } from '@survero/svelte';
  const survero = getSurvero();
</script>

<button onclick={() => survero.track('checkout_completed', { total: 42 })}>Pay</button>
```

`initSurvero` runs during server rendering too, where it does nothing; it starts in the browser on hydration. Page
views are tracked automatically on every navigation (`$screen`).

## Svelte (Vite)

Call `initSurvero({ apiKey: import.meta.env.VITE_SURVERO_KEY })` in the `<script>` of your root component.

Surveys, options, sinks and behavior: see [`@survero/web`](https://www.npmjs.com/package/@survero/web).
