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
  /** Clave PÚBLICA del proyecto (`pk_…`). Una `sk_` se rechaza: en una web la ve cualquiera. */
  apiKey: string;
  baseUrl?: string;
  /** Versión de tu app (columna `app_version`, para cortar resultados por versión). */
  appVersion?: string;
  /** Si la app ya conoce al usuario (equivale a llamar `identify`). */
  userId?: string;
  /** Segundos entre envíos. Por defecto 15. */
  flushInterval?: number;
  /**
   * `$screen` en cada cambio de ruta (History API: Next, Nuxt, SvelteKit, Angular, Vue Router…). `true` por defecto:
   * el nombre es la ruta con los segmentos variables como `:id` (`/orders/123` → `/orders/:id`). Una función decide
   * el nombre (o `null` para no registrarla); `false` lo desactiva.
   */
  autoScreen?: boolean | ((url: URL) => string | null);
  /** Los eventos van a la consola y a los sinks, sin enviarse (tests, previsualizaciones). */
  dryRun?: boolean;
  /** @internal pruebas */
  storage?: KeyValueStore;
  /** @internal pruebas */
  fetch?: typeof fetch;
  /** @internal pruebas */
  now?: () => number;
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/** Segmentos de ruta que son identificadores: números, UUID, hex largo, o tokens largos con dígitos. */
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
 * `Survero.surveys`. Manual (`show`) y automático (un `track` que coincide con un disparador) pasan por la misma
 * puerta: caps locales y reglas del servidor.
 */
export class SurveroSurveys {
  /** Kill switch local. */
  enabled = true;
  /** Override local del estilo del servidor. */
  theme?: SurveroTheme;
  /** Modo headless: tu propia UI. El SDK sigue contando impresiones, caps y eventos. */
  renderer?: SurveyRenderer;

  /** @internal */
  constructor(private readonly run: (fn: (core: Core) => Promise<SurveyOutcome | null>) => Promise<SurveyOutcome | null>) {}

  /** Muestra una encuesta por slug si la identidad es elegible. No salta caps ni reglas. `null` si no se mostró. */
  show(slug: string, props?: Props): Promise<SurveyOutcome | null> {
    return this.run((c) => c.gate.run(slug, null, sanitizeProps(props)));
  }

  /** Evalúa las encuestas de un evento disparador (el SDK lo hace solo en cada `track`). */
  onTrigger(event: string, props?: Props): Promise<SurveyOutcome | null> {
    return this.run((c) => c.gate.run(null, event, sanitizeProps(props)));
  }

  /** Recarga la lista de eventos disparadores (caché 1 h con ETag). */
  refreshTriggers(): Promise<void> {
    return this.run((c) => c.gate.refreshTriggers().then(() => null)).then(() => undefined);
  }
}

/**
 * Una instancia del SDK. Usa la por defecto: `import { Survero } from '@survero/web'`.
 *
 * Nada lanza hacia la app. En el servidor (SSR) todo es un no-op. Las llamadas antes de `init` se guardan y se
 * ejecutan al inicializar (en React, los efectos de los hijos corren antes que el del provider).
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
      const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
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

  /** Registra un evento. Nombre en snake_case (≤ 40). Booleanos se envían como 0/1. */
  track(name: string, props?: Props): void {
    this.with((c) => c.tracker.track(name, props));
  }

  /** Pantalla vista (`$screen` con `name`). Con `autoScreen` (por defecto) no hace falta llamarlo. */
  screen(name: string, props?: Props): void {
    this.with((c) => c.tracker.trackSystem('$screen', { ...sanitizeProps(props), name: String(name) }));
  }

  /** Asocia este navegador a un usuario de tu app (al iniciar sesión). Lo anterior al login queda atribuido. */
  identify(userId: string): void {
    this.with((c) => void c.tracker.identify(userId));
  }

  /** Cierre de sesión: los eventos siguientes vuelven a ser anónimos. */
  reset(): void {
    this.with((c) => c.tracker.reset());
  }

  /** Traits del usuario (o del navegador, si aún no hay identify). `null` borra la clave. */
  setTraits(traits: Props): void {
    this.with((c) => void c.tracker.setTraits(traits));
  }

  setTrait(key: string, value: unknown): void {
    this.setTraits({ [key]: value });
  }

  /** Envía ya lo pendiente (también ocurre cada 15 s, al llegar a 20 eventos y al ocultar la pestaña). */
  flush(): Promise<void> {
    return new Promise((resolve) => this.with((c) => c.tracker.flush().then(resolve, resolve)) || resolve());
  }

  /** Reenvía cada evento a otra herramienta. Devuelve la función para quitarlo. */
  addSink(sink: SurveroSink): () => void {
    this.with((c) => c.tracker.sinks.add(sink));
    return () => this.removeSink(sink);
  }

  removeSink(sink: SurveroSink): void {
    this.core?.tracker.sinks.delete(sink);
  }

  /** Libera el SDK (tests, cambio de proyecto). Lo pendiente sigue en el almacén. */
  dispose(): void {
    this.core?.stop();
    this.core = null;
  }

  /** Ejecuta ya, o al inicializar. false si se descarta (en el servidor, o más de 100 llamadas antes de init). */
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

/** Avisa de cada cambio de ruta (pushState, replaceState, popstate), una vez por ruta distinta. */
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

/** La instancia por defecto. */
export const Survero = new SurveroInstance();
