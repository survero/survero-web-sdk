import { readJson, writeJson, type KeyValueStore } from './store';

/** Confirmado, reintentar más tarde (red, 5xx, 408, 429) o descartar (otro 4xx: reintentar no lo arregla). */
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

/** HTTP contra las rutas SDK del API (`/sdk/...`) con la clave pública. Nunca lanza. */
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
   * `POST /sdk/events`. `keepalive` al cerrar la pestaña: la petición sobrevive a la página (máx. 64 kB). El
   * servidor deduplica por event_id, así que un lote que se reenvía tras un cierre no cuenta dos veces.
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

  /** Eventos que pueden disparar una encuesta (caché 1 h + ETag). Sin red: la última lista conocida. */
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

  /** La puerta del servidor: `{survey, reason, evaluated}` o null sin red / con error. */
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
