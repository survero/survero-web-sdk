// @vitest-environment jsdom
import { memoryStore, Survero } from '@survero/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, onMounted } from 'vue';
import { fakeApi } from '../../web/test/support';
import { SurveroPlugin, useSurvero } from '../src/index';

afterEach(() => Survero.dispose());

describe('@survero/vue', () => {
  it('plugin inicializa; useSurvero y $survero dan la instancia', async () => {
    const api = fakeApi();
    let fromGlobal: unknown;
    const App = defineComponent({
      setup() {
        const survero = useSurvero();
        onMounted(() => survero.track('app_mounted'));
        return () => h('div');
      },
      mounted() {
        fromGlobal = this.$survero;
      },
    });
    createApp(App)
      .use(SurveroPlugin, { apiKey: 'pk_live_test', baseUrl: 'https://api.test/api/v1', fetch: api.fetch, storage: memoryStore(), autoScreen: false })
      .mount(document.createElement('div'));
    await Survero.flush();
    expect(fromGlobal).toBe(Survero);
    expect(api.names()).toContain('app_mounted');
  });
});
