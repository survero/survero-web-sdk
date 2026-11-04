// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Survero } from '../src/index';

describe('SSR', () => {
  it('en el servidor todo es un no-op y nada lanza', async () => {
    Survero.init({ apiKey: 'pk_live_test' });
    Survero.track('x');
    Survero.identify('u');
    expect(Survero.isInitialized).toBe(false);
    await expect(Survero.surveys.show('nps')).resolves.toBeNull();
    await expect(Survero.flush()).resolves.toBeUndefined();
  });
});
