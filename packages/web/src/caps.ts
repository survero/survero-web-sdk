import { readJson, writeJson, type KeyValueStore } from './store';

export const CAPS_KEY = 'survero_survey_caps';
const COOLDOWN = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 2;

interface State {
  last_shown_at?: number;
  dismissed: Record<string, number>;
  answered: string[];
}

/**
 * Local caps: one impression every 7 days per browser, two dismissals of a survey = never again, answered = never
 * again. They avoid asking the server what is already known, and protect the user if the server does not answer.
 */
export class LocalCaps {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number,
  ) {}

  private read(): State {
    const s = readJson<Partial<State>>(this.store, CAPS_KEY) ?? {};
    return { ...s, dismissed: s.dismissed ?? {}, answered: s.answered ?? [] };
  }

  private inCooldown(s: State) {
    return s.last_shown_at != null && this.now() - s.last_shown_at < COOLDOWN;
  }

  /** Reason not to ask the server (only the cooldown is known without the survey). */
  blockBeforeServer(): string | null {
    return this.inCooldown(this.read()) ? 'cooldown' : null;
  }

  blockSurvey(slug: string): string | null {
    const s = this.read();
    if (s.answered.includes(slug)) return 'answered';
    if ((s.dismissed[slug] ?? 0) >= MAX_DISMISSALS) return 'dismissed_max';
    return this.inCooldown(s) ? 'cooldown' : null;
  }

  recordShown() {
    writeJson(this.store, CAPS_KEY, { ...this.read(), last_shown_at: this.now() });
  }

  recordDismissed(slug: string) {
    const s = this.read();
    writeJson(this.store, CAPS_KEY, { ...s, dismissed: { ...s.dismissed, [slug]: (s.dismissed[slug] ?? 0) + 1 } });
  }

  recordAnswered(slug: string) {
    const s = this.read();
    writeJson(this.store, CAPS_KEY, { ...s, answered: [...new Set([...s.answered, slug])] });
  }
}
