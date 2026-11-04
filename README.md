# Survero SDK — web

Eventos de producto, identidad y micro-encuestas para la web. Mismo contrato que el SDK Flutter 0.4 y KMP 0.1.

| Paquete | Para | API |
|---|---|---|
| [`@survero/web`](packages/web) | cualquier web, `<script>` | `Survero.init/track/screen/identify/reset/setTraits/flush`, `Survero.surveys.show` |
| [`@survero/react`](packages/react) | React, Next.js | `<SurveroProvider>`, `useSurvero()` (`'use client'`) |
| [`@survero/vue`](packages/vue) | Vue 3, Nuxt | `SurveroPlugin`, `useSurvero()`, `$survero` |
| [`@survero/svelte`](packages/svelte) | Svelte 5, SvelteKit | `initSurvero()`, `getSurvero()` |
| [`@survero/angular`](packages/angular) | Angular 19+, SSR | `provideSurvero()`, `inject(Survero)` |

Los README de cada paquete (en inglés, se publican en npm) tienen la instalación por framework.

## Decisiones

- **Envío desde localhost.** En móvil, los builds debug no envían. En la web no hay "build debug" fiable y el agente
  verifica la instalación con eventos reales desde el entorno local, así que se envía siempre; `dryRun: true` lo apaga.
- **Estado compartido entre pestañas.** Cola, sesión e identidad se releen de `localStorage` en cada operación: dos
  pestañas no se pisan la cola ni abren sesiones distintas.
- **Llamadas antes de `init`** se guardan (hasta 100): en React los efectos de los hijos corren antes que el del
  provider.
- **`sk_` se rechaza** (en móvil solo avisa): en una web la ve cualquiera.
- **`$screen` automático** por la History API, con los segmentos que parecen ids como `:id` para no crear una pantalla
  por pedido.
- **Fuente:** la hoja hereda la de la página; la del servidor solo si se pone en `surveys.theme.fontFamily`.
- **Angular 19+** (no 17): `provideEnvironmentInitializer`; 17 y 18 ya no tienen soporte de Angular.

## Desarrollo

```bash
npm install
npm run build          # los 5 paquetes (tsup)
npm test               # Vitest + jsdom: núcleo, encuestas, SSR, React, Vue
npm run size           # presupuesto gzip: núcleo < 12 kB, adaptadores < 1 kB
npm run typecheck

# Ejemplos contra el API local (http://localhost:4000): uno por adaptador, también prueban el CORS de /sdk/*.
CHROME_BIN=… npm run e2e
```

Ejemplos en `examples/` (`npm run dev -w example-react`, etc.). Leen la clave de `?key=…&api=…` o de
`VITE_SURVERO_KEY`.
