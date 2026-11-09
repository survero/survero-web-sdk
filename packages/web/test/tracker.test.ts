// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore, SurveroInstance } from '../src/index';
import { fakeApi, start, tick } from './support';

afterEach(() => vi.restoreAllMocks());

describe('eventos', () => {
  it('init: $install, sesión y lote con contexto y cabeceras', async () => {
    const { s, api } = start({ appVersion: '2.1.0' });
    s.track('signup_completed', { plan: 'pro', trial: true, ok: false, at: new Date('2026-01-01T00:00:00Z') });
    await s.flush();
    expect(api.names()).toEqual(['$install', '$session_started', 'signup_completed']);
    const ev = api.events()[2];
    expect(ev).toMatchObject({
      event_name: 'signup_completed',
      props: { plan: 'pro', trial: 1, ok: 0, at: '2026-01-01T00:00:00.000Z' },
      platform: 'web',
      sdk_version: 'web/0.1.0',
      app_version: '2.1.0',
    });
    expect(ev.device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ev.session_id).toBe(api.events()[1].session_id);
    const req = api.to('/sdk/events')[0]!;
    expect(req.headers['X-Survero-Key']).toBe('pk_live_test');
    expect(req.headers['Idempotency-Key']).toBe(api.events()[0].event_id);
  });

  it('rechaza una clave secreta: no envía nada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { s, api } = start({ apiKey: 'sk_live_secret' });
    s.track('x');
    await tick();
    expect(s.isInitialized).toBe(false);
    expect(api.requests).toHaveLength(0);
    expect(String(warn.mock.calls[0])).toContain('SECRET key');
  });

  it('las llamadas antes de init se ejecutan al inicializar', async () => {
    const api = fakeApi();
    const s = new SurveroInstance();
    s.track('early_event');
    s.identify('user-1');
    s.init({ apiKey: 'pk_live_test', baseUrl: 'https://api.test/api/v1', fetch: api.fetch, storage: memoryStore(), autoScreen: false });
    await s.flush();
    expect(api.names()).toContain('early_event');
    expect(api.to('/sdk/identify')[0]!.body).toMatchObject({ user_id: 'user-1' });
  });

  it('nombres inválidos y props reservadas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { s, api } = start();
    s.track('Bad Name');
    s.track('ok_event', { platform: 'ios', user_id: 'x', n: NaN, f: () => 1, nested: { a: true } });
    await s.flush();
    expect(api.names()).not.toContain('Bad Name');
    expect(api.events().find((e) => e.event_name === 'ok_event').props).toEqual({ nested: { a: 1 } });
  });

  it('sin red: la cola persiste y se envía después; un 400 se descarta', async () => {
    const { s, api, storage, time } = start();
    api.setOffline(true);
    s.track('a');
    await s.flush();
    expect(api.events().length).toBeGreaterThanOrEqual(3); // intentos fallidos
    api.setOffline(false);

    // Otra instancia (recarga de la página) con el mismo almacén envía lo pendiente.
    const s2 = new SurveroInstance();
    const api2 = fakeApi();
    s2.init({ apiKey: 'pk_live_test', baseUrl: 'https://api.test/api/v1', fetch: api2.fetch, now: time.now, storage, autoScreen: false });
    await s2.flush();
    expect(api2.names()).toEqual(['$install', '$session_started', 'a']);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api2.routes['/sdk/events'] = () => ({ status: 400 });
    s2.track('b');
    await s2.flush();
    api2.routes['/sdk/events'] = () => ({ status: 202 });
    await s2.flush();
    expect(api2.to('/sdk/events')).toHaveLength(2);
  });

  it('cola de como mucho 100 eventos', async () => {
    const { s, api } = start({ flushInterval: 999 });
    api.setOffline(true);
    for (let i = 0; i < 130; i++) s.track('e', { i });
    await tick();
    api.setOffline(false);
    await s.flush();
    const sent = api.to('/sdk/events').filter((r) => r.headers['Idempotency-Key']).at(-1)!.body.events;
    expect(sent).toHaveLength(100);
    expect(sent.at(-1).props.i).toBe(129);
  });

  it('sesión nueva tras 30 min de inactividad, con la duración de la anterior', async () => {
    const { s, api, time } = start();
    time.advance(5 * 60_000);
    s.track('a');
    time.advance(31 * 60_000);
    s.track('b');
    await s.flush();
    const evs = api.events();
    expect(evs.map((e) => e.event_name)).toEqual(['$install', '$session_started', 'a', '$session_ended', '$session_started', 'b']);
    expect(evs[3].props).toEqual({ duration_s: 300 });
    expect(evs[3].session_id).toBe(evs[1].session_id);
    expect(evs[5].session_id).not.toBe(evs[1].session_id);
  });

  it('identify sin red queda pendiente y se reintenta; reset vuelve a anónimo', async () => {
    const { s, api } = start();
    api.setOffline(true);
    s.identify('user-42');
    s.setTraits({ plan: 'pro', 'Bad Key': 1 });
    await tick();
    api.setOffline(false);
    s.track('after_login');
    await s.flush();
    expect(api.to('/sdk/identify').at(-1)!.body).toMatchObject({ user_id: 'user-42' });
    expect(api.to('/sdk/traits').at(-1)!.body).toMatchObject({ user_id: 'user-42', traits: { plan: 'pro' } });
    expect(api.events().find((e) => e.event_name === 'after_login').user_id).toBe('user-42');
    s.reset();
    s.track('after_logout');
    await s.flush();
    expect(api.events().find((e) => e.event_name === 'after_logout').user_id).toBeUndefined();
  });

  it('dryRun: sinks sí, red no', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { s, api } = start({ dryRun: true });
    const seen: string[] = [];
    s.addSink((e) => seen.push(e.name));
    s.track('a');
    await s.flush();
    expect(seen).toEqual(['a']);
    expect(api.to('/sdk/events')).toHaveLength(0);
  });

  it('al ocultar la pestaña envía con keepalive', async () => {
    const { s, api } = start();
    s.track('a');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(api.to('/sdk/events').some((r) => r.keepalive)).toBe(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    s.dispose();
  });
});

describe('autoScreen', () => {
  it('$screen al cambiar de ruta, con ids normalizados y sin repetir', async () => {
    history.replaceState(null, '', '/');
    const { s, api } = start({ autoScreen: true });
    history.pushState(null, '', '/orders/123');
    history.pushState(null, '', '/orders/123?tab=2');
    history.pushState(null, '', '/users/3f2c9a1e-8b7d-4c6e-9a1b-2c3d4e5f6a7b/settings/');
    await s.flush();
    const screens = api.events().filter((e) => e.event_name === '$screen').map((e) => e.props.name);
    expect(screens).toEqual(['/', '/orders/:id', '/users/:id/settings']);
    s.dispose();
  });
});
