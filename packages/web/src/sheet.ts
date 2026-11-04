import { followupFor, isRtl, type EligibleSurvey, type SurveroTheme, type SurveyAnswer, type SurveyOutcome } from './survey';

/**
 * La hoja de encuesta: Shadow DOM (los estilos de la página no la tocan ni ella a la página). Hoja inferior en
 * móvil, tarjeta abajo a la derecha en escritorio. Diálogo modal: foco atrapado, `Esc` cierra, el foco vuelve a
 * donde estaba. Toques ≥ 44 px, contraste AA en claro y oscuro, RTL.
 */
export function presentSheet(survey: EligibleSurvey, theme?: SurveroTheme): Promise<SurveyOutcome> {
  return new Promise((resolve) => {
    const host = document.createElement('survero-survey');
    const root = host.attachShadow({ mode: 'open' });
    const previous = document.activeElement as HTMLElement | null;
    let done = false;
    let pending: SurveyAnswer | null = null;

    const finish = (outcome: SurveyOutcome) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      host.remove();
      previous?.focus?.({ preventScroll: true });
      resolve(outcome);
    };

    const r = theme?.borderRadius ?? clamp(survey.style.borderRadius ?? 16, 0, 32);
    const vars = [
      `--r:${r}px`,
      `--rs:${r / 2}px`,
      theme?.backgroundColor && `--bg:${theme.backgroundColor}`,
      theme?.textColor && `--fg:${theme.textColor}`,
      theme?.fontFamily && `--font:${theme.fontFamily}`,
    ]
      .filter(Boolean)
      .join(';');
    root.innerHTML = `<style>${CSS}</style><div class="bd"></div><div class="sh" role="dialog" aria-modal="true" aria-labelledby="q" style="${esc(vars)}" dir="${isRtl(survey.locale) ? 'rtl' : 'auto'}"><button class="x" type="button" aria-label="${esc(closeLabel(survey.locale))}">${X}</button><h2 id="q">${esc(survey.question)}</h2><div class="b"></div><div class="f" hidden></div></div>`;

    const sheet = root.querySelector<HTMLElement>('.sh')!;
    const body = root.querySelector<HTMLElement>('.b')!;
    const follow = root.querySelector<HTMLElement>('.f')!;
    root.querySelector('.x')!.addEventListener('click', () => finish({ type: 'dismissed' }));
    root.querySelector('.bd')!.addEventListener('click', () => finish({ type: 'dismissed' }));

    const primary = theme?.primaryColor ?? survey.style.primaryColor;
    if (primary) sheet.style.setProperty('--p', primary);

    const button = (cls: string, html: string, label: string | null, answer: SurveyAnswer) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.innerHTML = html;
      if (label) b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => choose(answer, b));
      body.append(b);
      return b;
    };

    const choose = (answer: SurveyAnswer, b: HTMLElement) => {
      const key = answer.answerKey ?? String(answer.value);
      body.querySelectorAll('button').forEach((x) => {
        const v = Number(x.dataset['v']);
        const on = x === b || (survey.type === 'star' && answer.value != null && v <= answer.value);
        x.setAttribute('aria-pressed', String(x === b));
        x.classList.toggle('on', on);
      });
      if (!followupFor(survey, key)) return finish({ type: 'answered', answer });
      pending = answer;
      showFollow(survey.followup?.prompt ?? '');
    };

    const showFollow = (prompt: string) => {
      if (!follow.hidden) return follow.querySelector('textarea')!.focus();
      follow.hidden = false;
      follow.innerHTML = `${prompt ? `<label for="t">${esc(prompt)}</label>` : ''}<textarea id="t" rows="3" maxlength="2000"${
        prompt ? '' : ` aria-labelledby="q"`
      }${survey.followup?.placeholder ? ` placeholder="${esc(survey.followup.placeholder)}"` : ''}></textarea><button class="s" type="button">${esc(
        survey.submitLabel ?? 'OK',
      )}</button>`;
      const text = follow.querySelector('textarea')!;
      follow.querySelector('.s')!.addEventListener('click', () => {
        const clean = text.value.trim();
        if (survey.type === 'free_text') {
          if (clean) finish({ type: 'answered', answer: { answerKey: 'text', freeText: clean } });
          else text.focus();
          return;
        }
        if (pending) finish({ type: 'answered', answer: { ...pending, ...(clean ? { freeText: clean } : {}) } });
      });
      text.focus();
    };

    const min = survey.scaleMin;
    const max = survey.scaleMax;
    switch (survey.type) {
      case 'single_choice':
        body.className = 'b list';
        for (const o of survey.options) button('opt', esc(o.label), null, { answerKey: o.key });
        break;
      case 'emoji':
        body.className = 'b row';
        for (const o of survey.options) {
          button('emo', `<span aria-hidden="true">${esc(o.emoji ?? '')}</span><small>${esc(o.label)}</small>`, o.label, {
            answerKey: o.key,
          });
        }
        break;
      case 'star': {
        body.className = 'b row stars';
        const top = max ?? 5;
        for (let n = min ?? 1; n <= top; n++) button('star', STAR, `${n} / ${top}`, { value: n }).dataset['v'] = String(n);
        break;
      }
      case 'nps': {
        const lo = min ?? 0;
        const hi = max ?? 10;
        const count = hi - lo + 1;
        body.className = 'b nps';
        body.style.gridTemplateColumns = `repeat(${count > 7 ? Math.ceil(count / 2) : count},1fr)`;
        for (let n = lo; n <= hi; n++) button('num', String(n), null, { value: n });
        break;
      }
      case 'free_text':
        showFollow('');
        break;
    }
    if (body.childElementCount) {
      body.setAttribute('role', 'group');
      body.setAttribute('aria-labelledby', 'q');
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish({ type: 'dismissed' });
      } else if (e.key === 'Tab') {
        const items = [...sheet.querySelectorAll<HTMLElement>('button,textarea')].filter((el) => !el.closest('[hidden]'));
        const first = items[0];
        const last = items[items.length - 1];
        const active = root.activeElement;
        if (e.shiftKey && (active === first || !active)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && (active === last || !active)) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(host);

    // Texto sobre el color principal: negro o blanco según su luminancia (misma regla que Flutter/KMP).
    if (primary) {
      const probe = document.createElement('i');
      probe.style.color = primary;
      sheet.append(probe);
      const c = parseHex(primary) ?? parseRgb(getComputedStyle(probe).color);
      probe.remove();
      if (c) sheet.style.setProperty('--on', isLight(c) ? '#000' : '#fff');
    }

    (follow.querySelector('textarea') ?? body.querySelector('button') ?? sheet.querySelector<HTMLElement>('.x'))?.focus();
  });
}

function parseHex(color: string): [number, number, number] | null {
  const m = color.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isLight([r, g, b]: [number, number, number]) {
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05;
  return l * l > 0.15;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Etiqueta accesible del botón de cerrar en el idioma de la encuesta. */
export function closeLabel(locale: string): string {
  return { es: 'Cerrar', pt: 'Fechar', fr: 'Fermer', de: 'Schließen', it: 'Chiudi' }[locale.split(/[-_]/)[0]!] ?? 'Close';
}

const X = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
const STAR = `<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

// Claro: texto #111827 (17:1), secundario #4b5563 (7.6:1), bordes #6b7280 (4.8:1). Oscuro: equivalentes sobre #1f2937.
const CSS = `:host{all:initial;font-family:inherit}
.bd{position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:2147483000}
.sh{--p:#4f46e5;--on:#fff;--bg:#fff;--fg:#111827;--mu:#4b5563;--ln:#6b7280;--font:inherit;position:fixed;z-index:2147483001;box-sizing:border-box;right:24px;bottom:24px;width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow:auto;padding:8px 20px 20px;background:var(--bg);color:var(--fg);font:16px/1.4 var(--font);border-radius:var(--r);box-shadow:0 10px 40px rgba(0,0,0,.25);animation:in .2s ease-out}
@media (prefers-color-scheme:dark){.sh{--bg:#1f2937;--fg:#f9fafb;--mu:#d1d5db;--ln:#9ca3af}}
@media (max-width:640px){.sh{left:0;right:0;bottom:0;width:auto;max-width:none;border-radius:var(--r) var(--r) 0 0;padding-bottom:max(20px,env(safe-area-inset-bottom))}}
@media (prefers-reduced-motion:reduce){.sh{animation:none}}
@keyframes in{from{transform:translateY(16px);opacity:0}}
*{box-sizing:border-box;font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;margin:0;padding:0}
button:focus-visible,textarea:focus-visible{outline:2px solid var(--p);outline-offset:2px}
.x{display:flex;margin:0 -12px 0 auto;width:44px;height:44px;align-items:center;justify-content:center;color:var(--mu);border-radius:50%}
h2{margin:0 0 16px;font-size:18px;font-weight:600}
.list{display:flex;flex-direction:column;gap:8px}
.opt{min-height:48px;padding:12px 16px;text-align:start;border:1px solid var(--ln);border-radius:var(--rs)}
.opt.on{border:2px solid var(--p);padding:11px 15px}
.row{display:flex;flex-wrap:wrap;justify-content:space-evenly;gap:8px}
.emo{display:flex;flex-direction:column;align-items:center;min-width:64px;min-height:64px;padding:8px;border:2px solid transparent;border-radius:var(--r)}
.emo span{font-size:32px;line-height:1.2}.emo small{font-size:13px;color:var(--mu);margin-top:4px}
.emo.on{border-color:var(--p)}
.stars{justify-content:center;gap:0}
.star{width:44px;height:48px;display:flex;align-items:center;justify-content:center;color:var(--ln)}
.star path{fill:none;stroke:currentColor;stroke-width:1.5}
.star.on{color:var(--p)}.star.on path{fill:currentColor}
.nps{display:grid;gap:4px}
.num{height:44px;border:1px solid var(--ln);border-radius:8px;font-weight:600}
.num.on{background:var(--p);border-color:var(--p);color:var(--on)}
.f{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.f[hidden]{display:none}
label{color:var(--mu);font-size:14px}
textarea{width:100%;resize:vertical;padding:10px 12px;border:1px solid var(--ln);border-radius:var(--rs);background:transparent}
textarea::placeholder{color:var(--mu)}
.s{height:48px;margin-top:4px;border-radius:var(--rs);background:var(--p);color:var(--on);font-weight:600}`;
