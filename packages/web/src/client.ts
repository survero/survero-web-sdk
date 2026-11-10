import { readJson, writeJson, type KeyValueStore } from './store';

/** Confirmed, retry later (network, 5xx, 408, 429) or drop (any other 4xx: retrying will not fix it). */
export type SendOutcome = 'sent' | 'retry' | 'drop';

export const outcomeOf = (status: number): SendOutcome =>
  status >= 200 && status < 300 ? 'sent' : status === 408 || status === 429 || status >= 500 ? 'retry' : 'drop';

export const TRIGGERS_KEY = 'survero_survey_triggers';
const TRIGGERS_TTL = 60 * 60 * 1000;

interface TriggersCache {
  triggers: string[];
  etag?: string;
  fetched_at: number;
}

/** HTTP against the API's SDK routes (`/sdk/...`) with the public key. Never throws. */
export class Client {
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    private readonly store: KeyValueStore,
    private readonly now: () => number,
    private readonly fetchFn: typeof fetch,
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { 'X-Survero-Key': this.apiKey, Accept: 'application/json', ...extra };
  }

  /**
   * `POST /sdk/events`. `keepalive` when the tab closes: the request outlives the page (max 64 kB). The server
   * dedupes by event_id, so a batch resent after a close does not count twice.
   */
  postEvents(events: object[], keepalive = false): Promise<SendOutcome> {
    const first = events[0] as { event_id?: string } | undefined;
    return this.post('/sdk/events', { events }, first?.event_id, keepalive);
  }

  post(path: string, body: unknown, idempotencyKey?: string, keepalive = false): Promise<SendOutcome> {
    return this.fetchFn(this.base + path, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      }),
      body: JSON.stringify(body),
      keepalive,
    }).then(
      (res) => outcomeOf(res.status),
      () => 'retry' as const,
    );
  }

  /** Events that can trigger a survey (1 h cache + ETag). Offline: the last known list. */
  async getTriggers(): Promise<Set<string>> {
    const cached = readJson<TriggersCache>(this.store, TRIGGERS_KEY);
    const fromCache = () => new Set(cached?.triggers ?? []);
    if (cached && this.now() - cached.fetched_at < TRIGGERS_TTL) return fromCache();
    try {
      const res = await this.fetchFn(`${this.base}/sdk/surveys/triggers`, {
        headers: this.headers(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
      });
      let triggers: string[];
      if (res.status === 304 && cached) triggers = cached.triggers;
      else if (res.status === 200) triggers = ((await res.json()) as { triggers?: string[] }).triggers ?? [];
      else return fromCache();
      const etag = res.headers.get('ETag') ?? cached?.etag;
      writeJson(this.store, TRIGGERS_KEY, { triggers, ...(etag ? { etag } : {}), fetched_at: this.now() });
      return new Set(triggers);
    } catch {
      return fromCache();
    }
  }

  /** The server gate: `{survey, reason, evaluated}`, or null when offline or on error. */
  async eligible(query: Record<string, string>): Promise<Record<string, unknown> | null> {
    try {
      const res = await this.fetchFn(`${this.base}/sdk/surveys/eligible?${new URLSearchParams(query)}`, {
        headers: this.headers(),
      });
      return res.status === 200 ? ((await res.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
