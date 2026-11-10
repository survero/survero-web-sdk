import type { LocalCaps } from './caps';
import type { Client } from './client';
import type { Json } from './props';
import { log } from './store';
import {
  answerKeyOf,
  parseSurvey,
  SUPPORTED_TYPES,
  type EligibleSurvey,
  type SurveroTheme,
  type SurveyOutcome,
  type SurveyRenderer,
} from './survey';
import { strip, type SurveroEvent, type Tracker } from './tracker';

export type Presenter = (survey: EligibleSurvey, theme: SurveroTheme | undefined) => Promise<SurveyOutcome>;

export interface GateConfig {
  enabled: boolean;
  theme?: SurveroTheme;
  renderer?: SurveyRenderer;
}

/**
 * The gate. Manual (`show`) and automatic (a `track` that matches a trigger) both go through it: local caps → server
 * gate. Every evaluation emits `$survey_gate_evaluated {survey, trigger, reason}`, also when nothing is shown.
 */
export class SurveyGate {
  private triggers = new Set<string>();
  private busy = false;

  constructor(
    private readonly config: GateConfig,
    private readonly tracker: Tracker,
    private readonly client: Client,
    private readonly caps: LocalCaps,
    private readonly sheet: Presenter | null,
  ) {}

  /** Tracker sink: a trigger event opens the gate. */
  readonly sink = (event: SurveroEvent) => {
    if (!event.name.startsWith('$') && this.triggers.has(event.name)) void this.run(null, event.name, event.props);
  };

  async refreshTriggers() {
    this.triggers = await this.client.getTriggers();
  }

  async run(slug: string | null, trigger: string | null, props?: Record<string, Json>): Promise<SurveyOutcome | null> {
    let surveySlug = slug;
    const skip = (reason: string) => {
      this.tracker.trackSystem('$survey_gate_evaluated', strip({ survey: surveySlug, trigger, reason }));
      return null;
    };
    try {
      if (!this.config.enabled) return skip('disabled');
      const renderer = this.config.renderer;
      const present: Presenter | null = renderer
        ? (survey) => new Promise((resolve) => renderer(survey, once(resolve)))
        : this.sheet;
      if (!present) return skip('no_context');
      if (this.busy) return skip('busy');
      const blocked = this.caps.blockBeforeServer();
      if (blocked) return skip(blocked);

      this.busy = true;
      try {
        // Las reglas cuentan eventos en el servidor: el disparador (y lo encolado) tiene que haber llegado.
        await this.tracker.flush();
        const c = this.tracker.context;
        const userId = this.tracker.userId;
        const query: Record<string, string> = { device_id: this.tracker.deviceId, platform: c.platform, types: SUPPORTED_TYPES.join(',') };
        if (userId) query['user_id'] = userId;
        if (trigger) query['trigger'] = trigger;
        if (slug) query['slug'] = slug;
        if (c.locale) query['locale'] = c.locale;
        if (c.appVersion) query['app_version'] = c.appVersion;
        if (props && Object.keys(props).length) query['props'] = JSON.stringify(props);

        const result = await this.client.eligible(query);
        if (!result) return skip('offline');
        const json = result['survey'] as Record<string, unknown> | null | undefined;
        if (!json) {
          const evaluated = result['evaluated'] as { slug?: string }[] | undefined;
          surveySlug = evaluated?.[evaluated.length - 1]?.slug ?? surveySlug;
          return skip(typeof result['reason'] === 'string' ? result['reason'] : 'no_survey');
        }
        const survey = parseSurvey(json);
        surveySlug = survey.slug;
        const capped = this.caps.blockSurvey(survey.slug);
        if (capped) return skip(capped);
        skip('shown');
        return await this.present(present, survey, trigger);
      } finally {
        this.busy = false;
      }
    } catch (e) {
      log('survey failed', e);
      return null;
    }
  }

  private async present(present: Presenter, survey: EligibleSurvey, trigger: string | null): Promise<SurveyOutcome> {
    const t = this.tracker;
    const identity = strip({ device_id: t.deviceId, user_id: t.userId });
    const base = strip({ survey: survey.slug, trigger });
    const exposure = (outcome: string) =>
      void t.sendOrKeep({ path: `/sdk/surveys/${survey.id}/exposure`, body: strip({ ...identity, outcome, trigger_event: trigger }) });

    this.caps.recordShown();
    t.trackSystem('$survey_shown', base);
    exposure('shown');

    const outcome = await present(survey, this.config.theme);
    if (outcome.type === 'answered') {
      const a = outcome.answer;
      this.caps.recordAnswered(survey.slug);
      t.trackSystem('$survey_answered', { ...base, answer_key: answerKeyOf(a), has_text: !!a.freeText });
      void t.sendOrKeep({
        path: `/sdk/surveys/${survey.id}/response`,
        body: strip({
          ...identity,
          answer_key: a.answerKey,
          value: a.value,
          free_text: a.freeText,
          locale: survey.locale,
          app_version: t.context.appVersion,
          platform: t.context.platform,
          trigger_event: trigger,
        }),
      });
    } else {
      this.caps.recordDismissed(survey.slug);
      t.trackSystem('$survey_dismissed', base);
      exposure('dismissed');
    }
    return outcome;
  }
}

function once<T>(fn: (v: T) => void): (v: T) => void {
  let done = false;
  return (v) => {
    if (!done) {
      done = true;
      fn(v);
    }
  };
}
