# @survero/web

Product events, identity and in-app micro-surveys for any website. 9 kB gzip, no dependencies, SSR-safe.

> **Using an AI agent?** Run `npx survero init` in your project: it detects the framework, creates a project (no
> account needed) and wires this SDK for you.

Using a framework? Install its adapter instead (it re-exports everything here):
[`@survero/react`](https://www.npmjs.com/package/@survero/react) (React, Next.js) ·
[`@survero/vue`](https://www.npmjs.com/package/@survero/vue) (Vue, Nuxt) ·
[`@survero/svelte`](https://www.npmjs.com/package/@survero/svelte) (Svelte, SvelteKit) ·
[`@survero/angular`](https://www.npmjs.com/package/@survero/angular) (Angular).

## Install

```bash
npm install @survero/web
```

```ts
import { Survero } from '@survero/web';

// Once, at startup. The project PUBLIC key (pk_…). A secret key (sk_…) is refused: anyone can read it from the page.
Survero.init({ apiKey: 'pk_live_…' });

Survero.track('checkout_completed', { total: 42, express: true }); // booleans are sent as 0/1
Survero.identify('user-123');                                     // on login; Survero.reset() on logout
Survero.setTraits({ plan: 'pro' });                               // null deletes a trait
await Survero.surveys.show('nps');                                // or let a trigger event show it
```

Without a bundler:

```html
<script src="https://cdn.jsdelivr.net/npm/@survero/web@0/dist/survero.js" data-key="pk_live_…" defer></script>
<script>
  addEventListener('load', () => Survero.track('pricing_viewed'));
</script>
```

## Options

| Option | Default | |
|---|---|---|
| `apiKey` | — | Project public key (`pk_…`). |
| `appVersion` | — | Your app version, to slice results by release. |
| `userId` | — | Same as calling `identify`. |
| `autoScreen` | `true` | `$screen` on every route change (History API: works with Next, Nuxt, SvelteKit, Angular, Vue Router, React Router). Ids in paths become `:id` (`/orders/123` → `/orders/:id`). Pass a function `(url) => name \| null` to name screens yourself, or `false`. |
| `flushInterval` | `15` | Seconds between sends. |
| `dryRun` | `false` | Log to the console and to sinks; send nothing. |
| `baseUrl` | Survero cloud | For self-hosting. |

## Surveys

Surveys are created in the dashboard, or by your agent through the Survero MCP. The SDK shows them:

- **Automatically**, when a `track()` matches the survey's trigger event and the server rules pass.
- **Manually**, with `Survero.surveys.show(slug)`. It still respects caps and rules; it resolves with
  `{ type: 'answered', answer }`, `{ type: 'dismissed' }` or `null` when nothing was shown.

The built-in sheet lives in a Shadow DOM (your CSS can't break it, it can't break yours): a bottom sheet on phones, a
card on desktop. Five types (`single_choice`, `star`, `nps`, `emoji`, `free_text`), keyboard and screen-reader
accessible (focus trap, `Esc`, WCAG AA contrast in light and dark), right-to-left languages.

```ts
Survero.surveys.theme = { primaryColor: '#E30B5C', borderRadius: 12, fontFamily: 'Inter, sans-serif' };

// Headless: render your own UI. The SDK still records impressions, caps and events.
Survero.surveys.renderer = (survey, complete) => {
  openMyModal(survey, (answerKey) => complete({ type: 'answered', answer: { answerKey } }));
};
```

## Forward events

```ts
const stop = Survero.addSink((event) => gtag('event', event.name, event.props));
```

## Behavior

| | |
|---|---|
| Identity | `device_id` per browser (localStorage); `identify` links it to your user without rewriting history |
| Sessions | 30 min of inactivity; `$install`, `$session_started`, `$session_ended {duration_s}` automatic; shared across tabs |
| Sending | batches of ≤ 100 every 15 s, at 20 queued events, and with `keepalive` when the tab is hidden or closed |
| Offline | persistent queue (100 events, 7 days); identify, traits and survey answers retried; server dedupes by `event_id` |
| Before `init` | calls are kept (up to 100) and run on init: child components can track before the provider mounts |
| SSR | every call is a no-op on the server |
| Survey events | `$survey_gate_evaluated {reason}`, `$survey_shown`, `$survey_answered`, `$survey_dismissed` |
| Names | events and trait keys in `snake_case`, ≤ 40 chars; invalid ones are dropped with a console warning |

Nothing throws into your app.
