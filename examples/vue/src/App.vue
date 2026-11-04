<script setup lang="ts">
import { useSurvero } from '@survero/vue';
import { ref } from 'vue';

const survero = useSurvero();
const path = ref(location.pathname);

function login() {
  survero.identify('demo-user');
  survero.setTraits({ plan: 'pro' });
}

function pricing() {
  history.pushState(null, '', '/pricing/42' + location.search);
  path.value = location.pathname;
}
</script>

<template>
  <h1>Survero · Vue</h1>
  <p>Screen: <code>{{ path }}</code></p>
  <button @click="survero.track('checkout_completed', { total: 42, express: true })">Complete checkout</button>
  <button @click="login">Sign in as demo-user</button>
  <button @click="pricing">Go to pricing</button>
</template>
