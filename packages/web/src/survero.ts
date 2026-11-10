import { LocalCaps } from './caps';
import { Client } from './client';
import { SurveyGate } from './gate';
import { countryFromLocale, sanitizeProps, type Props } from './props';
import { presentSheet } from './sheet';
import { browserStore, log, type KeyValueStore } from './store';
import type { SurveroTheme, SurveyOutcome, SurveyRenderer } from './survey';
import { Tracker, type SurveroSink } from './tracker';

export const SDK_VERSION = '0.1.0';
export const DEFAULT_BASE_URL = 'https://api.survero.com/api/v1';

export interface SurveroOptions {
  /** The project's PUBLIC key (`pk_…`). An `sk_` is rejected: on a website anyone can see it. */
  apiKey: string;
  baseUrl?: string;
  /** Your app version (the `app_version` column, to cut results by release). */
  appVersion?: string;
  /** If the app already knows the user (same as calling `identify`). */
  userId?: string;
  /** Seconds between sends. Default 15. */
  flushInterval?: number;
  /**
   * `$screen` on every route change (History API: Next, Nuxt, SvelteKit, Angular, Vue Router…). `true` by default: the
   * name is the path with variable segments as `:id` (`/orders/123` → `/orders/:id`). A function decides the name (or
   * `null` to skip it); `false` turns it off.
   */
  autoScreen?: boolean | ((url: URL) => string | null);
  /** Events go to the console and the sinks, without being sent (tests, previews). */
  dryRun?: boolean;
  /** @internal tests */
  storage?: KeyValueStore;
  /** @internal tests */
  fetch?: typeof fetch;
  /** @internal tests */
  now?: () => number;
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/** Path segments that are identifiers: numbers, UUIDs, long hex, or long tokens with digits. */
export function screenName(url: URL): string {
  const path = url.pathname
    .split('/')
    .map((seg) =>
      /^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(seg) || /^[0-9a-f]{16,}$/i.test(seg) || (seg.length >= 16 && /\d/.test(seg))
        ? ':id'
        : seg,
    )
    .join('/');
  return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}

interface Core {
  key: string;
  tracker: Tracker;
  gate: SurveyGate;
  stop: () => void;
}

/**
 * `Survero.surveys`. Manual (`show`) and automatic (a `track` that matches a trigger) go through the same gate: local
 * caps and server rules.
 */
export class SurveroSurveys {
  /** Kill switch local. */
  enabled = true;
  /** Local override of the server style. */
  theme?: SurveroTheme;
  /** Headless mode: your own UI. The SDK still counts impressions, caps and events. */
  renderer?: SurveyRenderer;

  /** @internal */
  constructor(private readonly run: (fn: (core: Core) => Promise<SurveyOutcome | null>) => Promise<SurveyOutcome | null>) {}

  /** Shows a survey by slug if the identity is eligible. It does not skip caps or rules. `null` if it was not shown. */
  show(slug: string, props?: Props): Promise<SurveyOutcome | null> {
    return this.run((c) => c.gate.run(slug, null, sanitizeProps(props)));
  }

  /** Evaluates the surveys of a trigger event (the SDK does it on its own on every `track`). */
  onTrigger(event: string, props?: Props): Promise<SurveyOutcome | null> {
    return this.run((c) => c.gate.run(null, event, sanitizeProps(props)));
  }

  /** Reloads the list of trigger events (1 h cache with ETag). */
  refreshTriggers(): Promise<void> {
    return this.run((c) => c.gate.refreshTriggers().then(() => null)).then(() => undefined);
  }
}

/**
 * An SDK instance. Use the default one: `import { Survero } from '@survero/web'`.
 *
 * Nothing throws into the app. On the server (SSR) everything is a no-op. Calls made before `init` are kept and run on
 * init (in React, children's effects run before the provider's).
 */
export class SurveroInstance {
  readonly surveys: SurveroSurveys;
  private core: Core | null = null;
  private early: ((core: Core) => void)[] = [];
  private earlyWarned = false;

  constructor() {
    this.surveys = new SurveroSurveys(
      (fn) => new Promise((resolve) => this.with((core) => fn(core).then(resolve, () => resolve(null))) || resolve(null)),
    );
  }

  get isInitialized(): boolean {
    return this.core != null;
  }

  init(options: SurveroOptions): void {
    if (!isBrowser() && !options.storage) return;
    try {
      const apiKey = String(options.apiKey ?? '').trim();
      if (apiKey.startsWith('sk_')) {
        log(
          'refusing to start with a SECRET key (sk_): anyone can read it from the page. Use the project PUBLIC key (pk_). ' +
            'Rotate the exposed sk_ in the dashboard.',
        );
        return;
      }
      if (!apiKey) {
        log('init() needs the project public key (pk_…)');
        return;
      }
      // `''` o sin definir (p. ej. VITE_SURVERO_API_URL no puesta en producción) = Survero cloud.
      const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
      const key = `${apiKey}|${baseUrl}`;
      if (this.core?.key === key) return; // React StrictMode, HMR: mismo proyecto, nada que hacer
      this.dispose();

      const store = options.storage ?? browserStore();
      const now = options.now ?? Date.now;
      const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
      const locale = (typeof navigator !== 'undefined' && navigator.language) || null;
      const client = new Client(apiKey, baseUrl, store, now, fetchFn);
      const tracker = new Tracker(
        client,
        store,
        { platform: 'web', sdkVersion: `web/${SDK_VERSION}`, appVersion: options.appVersion ?? null, locale, country: countryFromLocale(locale) },
        now,
        !options.dryRun,
      );
      const gate = new SurveyGate(this.surveys, tracker, client, new LocalCaps(store, now), isBrowser() ? presentSheet : null);
      tracker.sinks.add(gate.sink);
      tracker.start();
      if (options.userId) void tracker.identify(options.userId);

      const stops: (() => void)[] = [];
      if (isBrowser()) {
        const interval = setInterval(() => void tracker.flush(), Math.max(1, options.flushInterval ?? 15) * 1000);
        stops.push(() => clearInterval(interval));
        const onVisibility = () => (document.visibilityState === 'hidden' ? tracker.onHidden() : tracker.onVisible());
        const onHide = () => tracker.onHidden();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onHide);
        stops.push(() => {
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('pagehide', onHide);
        });
        if (options.autoScreen !== false) {
          const name = typeof options.autoScreen === 'function' ? options.autoScreen : screenName;
          stops.push(watchRoutes((url) => {
            const screen = name(url);
            if (screen) tracker.trackSystem('$screen', { name: screen });
          }));
        }
      }
      this.core = { key, tracker, gate, stop: () => stops.forEach((s) => s()) };
      const core = this.core;
      void gate.refreshTriggers().then(() => tracker.flush());
      const early = this.early;
      this.early = [];
      early.forEach((fn) => fn(core));
    } catch (e) {
      log('init failed', e);
    }
  }

  /** Records an event. Name in snake_case (≤ 40). Booleans are sent as 0/1. Reserved prop keys are dropped with a warning. */
  track(name: string, props?: Props): void {
    this.with((c) => c.tracker.track(name, props));
  }

  /** Screen viewed (`$screen` with `name`). With `autoScreen` (the default) you do not need to call it. */
  screen(name: string, props?: Props): void {
    this.with((c) => c.tracker.trackSystem('$screen', { ...sanitizeProps(props), name: String(name) }));
  }

  /** Links this browser to a user of your app (on login), with your internal id, never the email. What happened before login stays attributed. */
  identify(userId: string): void {
    this.with((c) => void c.tracker.identify(userId));
  }

  /** Logout: the following events are anonymous again. */
  reset(): void {
    this.with((c) => c.tracker.reset());
  }

  /** User traits (or the browser's, if there is no identify yet). `null` deletes the key. */
  setTraits(traits: Props): void {
    this.with((c) => void c.tracker.setTraits(traits));
  }

  setTrait(key: string, value: unknown): void {
    this.setTraits({ [key]: value });
  }

  /** Sends what is pending now (it also happens every 15 s, at 20 events and when the tab is hidden). */
  flush(): Promise<void> {
    return new Promise((resolve) => this.with((c) => c.tracker.flush().then(resolve, resolve)) || resolve());
  }

  /** Forwards every event to another tool. Returns the function that removes it. */
  addSink(sink: SurveroSink): () => void {
    this.with((c) => c.tracker.sinks.add(sink));
    return () => this.removeSink(sink);
  }

  removeSink(sink: SurveroSink): void {
    this.core?.tracker.sinks.delete(sink);
  }

  /** Releases the SDK (tests, switching project). What is pending stays in the store. */
  dispose(): void {
    this.core?.stop();
    this.core = null;
  }

  /** Runs now, or on init. false if dropped (on the server, or more than 100 calls before init). */
  private with(fn: (core: Core) => void): boolean {
    if (this.core) {
      try {
        fn(this.core);
      } catch (e) {
        log(e);
      }
      return true;
    }
    if (!isBrowser() || this.early.length >= 100) return false;
    this.early.push(fn);
    if (!this.earlyWarned) {
      this.earlyWarned = true;
      setTimeout(() => this.core || log('call Survero.init({ apiKey }) to start sending events'), 5000);
    }
    return true;
  }
}

/** Reports every route change (pushState, replaceState, popstate), once per distinct route. */
function watchRoutes(onRoute: (url: URL) => void): () => void {
  let last = '';
  const check = () => {
    const url = new URL(location.href);
    if (url.pathname === last) return;
    last = url.pathname;
    onRoute(url);
  };
  const h = history as History & { __survero?: boolean };
  if (!h.__survero) {
    h.__survero = true;
    for (const m of ['pushState', 'replaceState'] as const) {
      const original = h[m];
      h[m] = function (this: History, ...args: Parameters<History['pushState']>) {
        const out = original.apply(this, args);
        window.dispatchEvent(new Event('survero:navigate'));
        return out;
      };
    }
  }
  window.addEventListener('survero:navigate', check);
  window.addEventListener('popstate', check);
  check();
  return () => {
    window.removeEventListener('survero:navigate', check);
    window.removeEventListener('popstate', check);
  };
}

/** The default instance. */
export const Survero = new SurveroInstance();
