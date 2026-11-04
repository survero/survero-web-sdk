// @vitest-environment node
import { Survero } from '@survero/web';
import { describe, expect, it } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { SurveroPlugin, useSurvero } from '../src/index';

describe('@survero/vue en SSR (Nuxt)', () => {
  it('renderiza en el servidor sin tocar window ni inicializar', async () => {
    const App = defineComponent({
      setup() {
        useSurvero().track('rendered_on_server');
        return () => h('p', 'ok');
      },
    });
    const html = await renderToString(createSSRApp(App).use(SurveroPlugin, { apiKey: 'pk_live_test' }));
    expect(html).toBe('<p>ok</p>');
    expect(Survero.isInitialized).toBe(false);
  });
});
