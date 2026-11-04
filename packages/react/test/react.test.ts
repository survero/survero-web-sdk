// @vitest-environment jsdom
import { memoryStore, Survero } from '@survero/web';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi } from '../../web/test/support';
import { SurveroProvider, useSurvero } from '../src/index';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => Survero.dispose());

describe('@survero/react', () => {
  it('provider inicializa; los efectos de los hijos (que corren antes) no se pierden; userId → identify/reset', async () => {
    const api = fakeApi();
    const opts = { apiKey: 'pk_live_test', baseUrl: 'https://api.test/api/v1', fetch: api.fetch, storage: memoryStore(), autoScreen: false };
    function Child() {
      const survero = useSurvero();
      useEffect(() => survero.track('child_mounted'), [survero]);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(SurveroProvider, { ...opts, userId: 'u-1' }, createElement(Child))));
    expect(Survero.isInitialized).toBe(true);
    await act(async () => root.render(createElement(SurveroProvider, { ...opts }, createElement(Child))));
    Survero.track('after_logout');
    await Survero.flush();
    expect(api.names()).toContain('child_mounted');
    expect(api.to('/sdk/identify')[0]!.body.user_id).toBe('u-1');
    expect(api.events().find((e) => e.event_name === 'child_mounted').user_id).toBe('u-1');
    expect(api.events().find((e) => e.event_name === 'after_logout').user_id).toBeUndefined();
    root.unmount();
  });
});
