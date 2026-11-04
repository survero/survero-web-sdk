## 0.1.0

* Primera versión, con el contrato de Flutter 0.4 y KMP 0.1: `track`, `screen`, `identify`, `reset`, `setTraits`,
  `flush`, sinks; sesiones de 30 min; cola en `localStorage` (100 eventos / 7 días) compartida entre pestañas; envío
  con `keepalive` al ocultar la pestaña; `$screen` automático por la History API.
* Encuestas: `Survero.surveys.show(slug)` y disparo automático por evento, con la puerta del servidor y caps locales.
  Hoja en Shadow DOM (`single_choice`, `star`, `nps`, `emoji`, `free_text`, follow-up en la misma hoja), modo headless.
* Build `<script>` con `data-key`; seguro en SSR; rechaza claves `sk_`.
* Adaptadores: `@survero/react`, `@survero/vue`, `@survero/svelte`, `@survero/angular`.
