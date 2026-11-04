// @vitest-environment node
import { Survero } from '@survero/web';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SurveroProvider, useSurvero } from '../src/index';

describe('@survero/react en SSR (Next.js)', () => {
  it('renderiza en el servidor sin tocar window ni inicializar', () => {
    function Page() {
      useSurvero().track('rendered_on_server');
      return createElement('p', null, 'ok');
    }
    expect(renderToString(createElement(SurveroProvider, { apiKey: 'pk_live_test' }, createElement(Page)))).toBe('<p>ok</p>');
    expect(Survero.isInitialized).toBe(false);
  });
});
