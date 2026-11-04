<script lang="ts">
  import { getSurvero } from '@survero/svelte';

  const survero = getSurvero();
  let path = $state(location.pathname);

  function login() {
    survero.identify('demo-user');
    survero.setTraits({ plan: 'pro' });
  }

  function pricing() {
    history.pushState(null, '', '/pricing/42' + location.search);
    path = location.pathname;
  }
</script>

<h1>Survero · Svelte</h1>
<p>Screen: <code>{path}</code></p>
<button onclick={() => survero.track('checkout_completed', { total: 42, express: true })}>Complete checkout</button>
<button onclick={login}>Sign in as demo-user</button>
<button onclick={pricing}>Go to pricing</button>
