import { memoryStore, SurveroInstance, type KeyValueStore, type SurveroOptions } from '../src/index';

export interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: any;
  keepalive: boolean;
}

/** API falsa: registra peticiones y responde según `routes` (por defecto 202/200 vacíos). */
export function fakeApi() {
  const requests: Req[] = [];
  let offline = false;
  const routes: Record<string, (req: Req) => { status: number; body?: unknown; headers?: Record<string, string> }> = {};
  const fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const req: Req = {
      method: init.method ?? 'GET',
      path: url.pathname.replace('/api/v1', ''),
      query: url.searchParams,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      keepalive: !!init.keepalive,
    };
    requests.push(req);
    if (offline) throw new TypeError('Failed to fetch');
    const route = routes[`${req.method} ${req.path}`] ?? routes[req.path];
    const res = route?.(req) ?? {
      status: req.path === '/sdk/surveys/triggers' ? 200 : req.method === 'GET' ? 200 : 202,
      body: req.path === '/sdk/surveys/triggers' ? { triggers: [] } : req.path === '/sdk/surveys/eligible' ? { survey: null, reason: 'no_survey' } : {},
    };
    return new Response(res.status === 304 ? null : JSON.stringify(res.body ?? {}), { status: res.status, headers: res.headers });
  }) as unknown as typeof globalThis.fetch;
  return {
    fetch,
    requests,
    routes,
    setOffline: (v: boolean) => (offline = v),
    events: () => requests.filter((r) => r.path === '/sdk/events').flatMap((r) => r.body.events as any[]),
    names: () => requests.filter((r) => r.path === '/sdk/events').flatMap((r) => (r.body.events as any[]).map((e) => e.event_name)),
    to: (path: string) => requests.filter((r) => r.path === path),
  };
}

export function clock(start = Date.parse('2026-11-04T10:00:00Z')) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

export function start(opts: Partial<SurveroOptions> & { store?: KeyValueStore } = {}) {
  const api = fakeApi();
  const time = clock();
  const storage = opts.store ?? memoryStore();
  const s = new SurveroInstance();
  s.init({ apiKey: 'pk_live_test', baseUrl: 'https://api.test/api/v1', fetch: api.fetch, now: time.now, storage, autoScreen: false, ...opts });
  return { s, api, time, storage };
}

/** Deja correr promesas pendientes. */
export const tick = (n = 10) => new Promise<void>((r) => setTimeout(r, n));
