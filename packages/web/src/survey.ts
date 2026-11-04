/** Encuesta que la puerta del servidor decidió mostrar, con el copy ya en un idioma. */
export interface EligibleSurvey {
  id: string;
  slug: string;
  /** `single_choice`, `star`, `nps`, `emoji` o `free_text`. */
  type: string;
  locale: string;
  question: string;
  triggerEvent: string | null;
  options: SurveyOption[];
  followup: SurveyFollowup | null;
  submitLabel: string | null;
  /** Escala de `star` (1..max) y `nps` (0..10). */
  scaleMin: number | null;
  scaleMax: number | null;
  style: { primaryColor?: string; fontFamily?: string; borderRadius?: number };
}

export interface SurveyOption {
  key: string;
  label: string;
  emoji?: string;
}

export interface SurveyFollowup {
  prompt: string;
  placeholder?: string;
  /** Vacío = siempre. */
  forKeys: string[];
}

/** Respuesta: la clave estable de la opción, el valor de la escala y/o texto libre. */
export interface SurveyAnswer {
  answerKey?: string;
  value?: number;
  freeText?: string;
}

export type SurveyOutcome = { type: 'answered'; answer: SurveyAnswer } | { type: 'dismissed' };

/**
 * Renderer propio (headless): recibe la encuesta localizada y llama a `complete` una vez. El SDK sigue registrando
 * impresiones, caps y eventos.
 */
export type SurveyRenderer = (survey: EligibleSurvey, complete: (outcome: SurveyOutcome) => void) => void;

/** Override local del estilo del servidor. Colores CSS; radio en px. */
export interface SurveroTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  /** Por defecto, la fuente de la página. La del servidor solo se usa si la página ya la carga y la pones aquí. */
  fontFamily?: string;
}

/** Tipos que sabe pintar esta versión (se envían al servidor; uno nuevo → `sdk_too_old`). */
export const SUPPORTED_TYPES = ['single_choice', 'star', 'nps', 'emoji', 'free_text'];

/** Clave que se emite en `$survey_answered` y se guarda en el servidor. */
export const answerKeyOf = (a: SurveyAnswer) => a.answerKey ?? (a.value != null ? String(a.value) : 'text');

export const followupFor = (s: EligibleSurvey, key: string) =>
  !!s.followup && (!s.followup.forKeys.length || s.followup.forKeys.includes(key));

export const isRtl = (locale: string) => ['ar', 'he', 'fa', 'ur', 'ps', 'yi'].includes(locale.split(/[-_]/)[0]!);

type Obj = Record<string, any>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseSurvey(json: Obj): EligibleSurvey {
  const copy: Obj = json['copy'] ?? {};
  const f: Obj | undefined = copy['followup'];
  const style: Obj = json['style'] ?? {};
  return {
    id: String(json['id']),
    slug: String(json['slug']),
    type: String(json['type']),
    locale: str(json['locale']) ?? 'en',
    question: str(copy['question']) ?? '',
    triggerEvent: str(json['trigger_event']) ?? null,
    options: (Array.isArray(copy['options']) ? copy['options'] : [])
      .filter((o: Obj) => o && str(o['key']))
      .map((o: Obj) => ({ key: o['key'], label: str(o['label']) ?? o['key'], ...(str(o['emoji']) ? { emoji: o['emoji'] } : {}) })),
    followup: f
      ? {
          prompt: str(f['prompt']) ?? '',
          ...(str(f['placeholder']) ? { placeholder: f['placeholder'] } : {}),
          forKeys: Array.isArray(f['for_keys']) ? f['for_keys'].filter((k: unknown) => typeof k === 'string') : [],
        }
      : null,
    submitLabel: str(copy['submit']) ?? null,
    scaleMin: num(json['scale']?.['min']),
    scaleMax: num(json['scale']?.['max']),
    style: {
      ...(str(style['primaryColor']) ? { primaryColor: style['primaryColor'] } : {}),
      ...(str(style['fontFamily']) ? { fontFamily: style['fontFamily'] } : {}),
      ...(num(style['borderRadius']) != null ? { borderRadius: style['borderRadius'] } : {}),
    },
  };
}
