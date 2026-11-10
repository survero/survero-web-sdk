// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { start, tick } from './support';

const survey = (over: Record<string, unknown> = {}) => ({
  id: 'svy-1',
  slug: 'sean-ellis',
  type: 'single_choice',
  locale: 'es',
  copy: {
    question: '¿Cómo te sentirías si ya no pudieras usar la app?',
    options: [
      { key: 'very', label: 'Muy decepcionado' },
      { key: 'somewhat', label: 'Algo decepcionado' },
    ],
    followup: { prompt: '¿Por qué?', placeholder: 'Cuéntanos', for_keys: ['very'] },
    submit: 'Enviar',
  },
  style: { primaryColor: '#ffcc00', borderRadius: 12 },
  ...over,
});

const sheet = () => document.querySelector('survero-survey')?.shadowRoot ?? null;

async function shown() {
  for (let i = 0; i < 50 && !sheet(); i++) await tick(5);
  return sheet()!;
}

afterEach(() => {
  document.querySelector('survero-survey')?.remove();
  vi.restoreAllMocks();
});

describe('encuestas', () => {
  it('show: flush antes de la puerta, hoja accesible, respuesta con su clave', async () => {
    const { s, api } = start({ appVersion: '1.0.0' });
    api.routes['/sdk/surveys/eligible'] = () => ({ status: 200, body: { survey: survey(), reason: 'eligible' } });
    s.track('opened');
    const result = s.surveys.show('sean-ellis');
    const root = await shown();

    const eligible = api.to('/sdk/surveys/eligible')[0]!;
    const eventsBefore = api.requests.indexOf(api.to('/sdk/events')[0]!);
    expect(eventsBefore).toBeLessThan(api.requests.indexOf(eligible));
    expect(Object.fromEntries(eligible.query)).toMatchObject({
      slug: 'sean-ellis',
      platform: 'web',
      app_version: '1.0.0',
      types: 'single_choice,star,nps,emoji,free_text',
    });

    const dialog = root.querySelector('[role=dialog]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(root.getElementById('q')!.textContent).toContain('usar la app');
    expect(root.querySelector('.x')!.getAttribute('aria-label')).toBe('Cerrar');
    expect(root.activeElement?.textContent).toBe('Muy decepcionado');
    // Texto negro sobre amarillo.
    expect((dialog as HTMLElement).style.getPropertyValue('--on')).toBe('#000');

    (root.querySelectorAll('.opt')[1] as HTMLElement).click(); // sin follow-up
    expect(await result).toEqual({ type: 'answered', answer: { answerKey: 'somewhat' } });
    await s.flush();
    await tick();
    expect(api.to('/sdk/surveys/svy-1/response')[0]!.body).toMatchObject({ answer_key: 'somewhat', locale: 'es', platform: 'web' });
    expect(api.to('/sdk/surveys/svy-1/exposure')[0]!.body).toMatchObject({ outcome: 'shown' });
    const names = api.names();
    expect(names).toEqual(expect.arrayContaining(['$survey_gate_evaluated', '$survey_shown', '$survey_answered']));
    expect(api.events().find((e) => e.event_name === '$survey_answered').props).toMatchObject({ survey: 'sean-ellis', answer_key: 'somewhat', has_text: 0 });
    expect(sheet()).toBeNull();
  });

  it('follow-up en la misma hoja y texto libre en la respuesta', async () => {
    const { s, api } = start();
    api.routes['/sdk/surveys/eligible'] = () => ({ status: 200, body: { survey: survey() } });
    const result = s.surveys.show('sean-ellis');
    const root = await shown();
    (root.querySelectorAll('.opt')[0] as HTMLElement).click();
    const text = root.querySelector('textarea')!;
    expect(root.activeElement).toBe(text);
    expect(root.querySelector('label')!.textContent).toBe('¿Por qué?');
    text.value = '  Me ahorra horas  ';
    (root.querySelector('.s') as HTMLElement).click();
    expect(await result).toEqual({ type: 'answered', answer: { answerKey: 'very', freeText: 'Me ahorra horas' } });
    await tick();
    expect(api.to('/sdk/surveys/svy-1/response')[0]!.body).toMatchObject({ answer_key: 'very', free_text: 'Me ahorra horas' });
  });

  it('Esc descarta; después, el cooldown local evita preguntar al servidor', async () => {
    const { s, api } = start();
    api.routes['/sdk/surveys/eligible'] = () => ({ status: 200, body: { survey: survey() } });
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const result = s.surveys.show('sean-ellis');
    await shown();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await result).toEqual({ type: 'dismissed' });
    expect(document.activeElement).toBe(button);
    await tick();
    expect(api.to('/sdk/surveys/svy-1/exposure').map((r) => r.body.outcome)).toEqual(['shown', 'dismissed']);

    expect(await s.surveys.show('sean-ellis')).toBeNull();
    expect(api.to('/sdk/surveys/eligible')).toHaveLength(1);
    await s.flush();
    const reasons = api.events().filter((e) => e.event_name === '$survey_gate_evaluated').map((e) => e.props.reason);
    expect(reasons).toEqual(['shown', 'cooldown']);
    button.remove();
  });

  it('el servidor dice que no: razón registrada y nada en pantalla', async () => {
    const { s, api } = start();
    api.routes['/sdk/surveys/eligible'] = () => ({ status: 200, body: { survey: null, reason: 'rules_not_met', evaluated: [{ slug: 'nps' }] } });
    expect(await s.surveys.show('nps')).toBeNull();
    await s.flush();
    expect(api.events().find((e) => e.event_name === '$survey_gate_evaluated').props).toEqual({ survey: 'nps', reason: 'rules_not_met' });
    expect(sheet()).toBeNull();
  });

  it('disparo automático: un track que coincide con un disparador abre la puerta', async () => {
    const { s, api, storage } = start();
    api.routes['/sdk/surveys/triggers'] = () => ({ status: 200, body: { triggers: ['checkout_completed'] }, headers: { ETag: '"v1"' } });
    api.routes['/sdk/surveys/eligible'] = () => ({ status: 200, body: { survey: survey({ type: 'nps', copy: { question: 'NPS?' }, scale: { min: 0, max: 10 } }) } });
    storage.remove('survero_survey_triggers'); // la caché de 1 h ya tiene la lista vacía del arranque
    await s.surveys.refreshTriggers();
    s.track('checkout_completed', { total: 12 });
    const root = await shown();
    const eligible = api.to('/sdk/surveys/eligible')[0]!;
    expect(eligible.query.get('trigger')).toBe('checkout_completed');
    expect(JSON.parse(eligible.query.get('props')!)).toEqual({ total: 12 });
    const nums = root.querySelectorAll('.num');
    expect(nums).toHaveLength(11);
    (nums[9] as HTMLElement).click();
    await tick();
    expect(api.to('/sdk/surveys/svy-1/response')[0]!.body).toMatchObject({ value: 9, trigger_event: 'checkout_completed' });
  });

  it('headless: el renderer de la app recibe la encuesta y el SDK registra igual', async () => {
    const { s, api } = start();
    api.routes['/sdk/surveys/eligible'] = () => ({ status: 200, body: { survey: survey({ type: 'star', scale: { min: 1, max: 5 } }) } });
    const seen: string[] = [];
    s.surveys.renderer = (sv, complete) => {
      seen.push(`${sv.type}:${sv.scaleMax}:${sv.question}`);
      complete({ type: 'answered', answer: { value: 4 } });
      complete({ type: 'dismissed' }); // ignorado
    };
    expect(await s.surveys.show('stars')).toEqual({ type: 'answered', answer: { value: 4 } });
    expect(seen).toEqual(['star:5:¿Cómo te sentirías si ya no pudieras usar la app?']);
    expect(sheet()).toBeNull();
    await tick();
    expect(api.to('/sdk/surveys/svy-1/response')[0]!.body).toMatchObject({ value: 4 });
  });

  it('cinco tipos, texto escapado y RTL', async () => {
    const { s, api } = start();
    let type = 'emoji';
    api.routes['/sdk/surveys/eligible'] = () => ({
      status: 200,
      body: {
        survey: survey({
          id: `svy-${type}`,
          slug: type,
          type,
          locale: 'ar',
          copy: { question: '<img src=x onerror=alert(1)>', options: [{ key: 'happy', label: 'Feliz', emoji: '😀' }] },
          scale: { min: 1, max: 5 },
        }),
      },
    });
    s.surveys.renderer = undefined;
    for (type of ['emoji', 'star', 'free_text']) {
      // Sin cooldown entre pruebas.
      globalThis.localStorage?.clear(); // Node 25+ trae un localStorage propio (undefined sin --localstorage-file) que tapa el de jsdom
      (s as any).core.gate.caps.recordShown = () => {};
      const result = s.surveys.show(type);
      const root = await shown();
      expect(root.querySelector('img')).toBeNull();
      expect(root.querySelector('[role=dialog]')!.getAttribute('dir')).toBe('rtl');
      if (type === 'emoji') {
        expect(root.querySelector('.emo')!.getAttribute('aria-label')).toBe('Feliz');
        (root.querySelector('.emo') as HTMLElement).click();
      } else if (type === 'star') {
        const stars = root.querySelectorAll('.star');
        expect(stars).toHaveLength(5);
        expect(stars[2]!.getAttribute('aria-label')).toBe('3 / 5');
        (stars[2] as HTMLElement).click();
      } else {
        const text = root.querySelector('textarea')!;
        expect(root.activeElement).toBe(text);
        (root.querySelector('.s') as HTMLElement).click(); // vacío: no envía
        expect(sheet()).not.toBeNull();
        text.value = 'hola';
        (root.querySelector('.s') as HTMLElement).click();
      }
      expect(await result).toMatchObject({ type: 'answered' });
    }
    await tick();
    expect(api.to('/sdk/surveys/svy-free_text/response')[0]!.body).toMatchObject({ answer_key: 'text', free_text: 'hola' });
  });
});
