import type { Client, SendOutcome } from './client';
import { NAME, sanitizeProps, sanitizeTraits, type Json, type Props } from './props';
import { log, readJson, uuid, writeJson, type KeyValueStore } from './store';

/** An event as the SDK records it (and the sinks of `Survero.addSink` receive it). */
export interface SurveroEvent {
  eventId: string;
  name: string;
  /** Props already sanitized (booleans as 0/1). */
  props: Record<string, Json>;
  /** When the event happened in the browser, in ms since epoch. */
  timestamp: number;
  deviceId: string;
  userId: string | null;
  sessionId: string | null;
}

export type SurveroSink = (event: SurveroEvent) => void;

/** Dimensions the SDK stamps on every event (columns on the server, never props). */
export interface EventContext {
  platform: string;
  sdkVersion: string;
  appVersion: string | null;
  locale: string | null;
  country: string | null;
}

export const KEYS = {
  device: 'survero_device_id',
  user: 'survero_user_id',
  queue: 'survero_event_queue',
  pending: 'survero_pending_ops',
  session: 'survero_session',
} as const;

const SESSION_TIMEOUT = 30 * 60 * 1000;
const QUEUE_MAX = 100;
const QUEUE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_OPS = 50;
const BATCH = 100;
/** `fetch keepalive` limit (64 kB), with margin. */
const KEEPALIVE_BYTES = 60_000;

interface Session {
  id: string;
  start: number;
  last: number;
}

/** An operation retried when offline: identify, traits, survey exposure or survey answer. */
export interface PendingOp {
  path: string;
  body: Record<string, unknown>;
}

/**
 * Event core: identity, 30-minute sessions, persistent queue (100 events / 7 days), batches and retries. All state
 * lives in the store and is re-read on every operation: several tabs share queue, session and identity.
 */
export class Tracker {
  readonly sinks = new Set<SurveroSink>();
  private flushing: Promise<void> | null = null;
  /**
   * Events in a send in progress. The `keepalive` send (tab hidden / closing) does not wait for the normal one: without
   * this, visibilitychange + pagehide + the interval sent the same batch 2–3 times.
   */
  private readonly inflight = new Set<string>();

  constructor(
    private readonly client: Client,
    private readonly store: KeyValueStore,
    readonly context: EventContext,
    private readonly now: () => number,
    /** false with `dryRun`: events go to the console and sinks, not to the API. */
    private readonly send: boolean,
    private readonly flushAt = 20,
  ) {}

  get deviceId(): string {
    let id = this.store.get(KEYS.device);
    if (!id) {
      id = uuid();
      this.store.set(KEYS.device, id);
    }
    return id;
  }

  get userId(): string | null {
    return this.store.get(KEYS.user);
  }

  /** `$install` the first time in this browser; opens or continues the session. */
  start() {
    if (!this.store.get(KEYS.device)) {
      void this.deviceId;
      this.record('$install', {});
    }
    this.touch();
  }

  track(name: string, props?: Props | null) {
    if (!NAME.test(name)) {
      log(`ignored event "${name}": names must be snake_case, ≤ 40 chars`);
      return;
    }
    this.touch();
    const event = this.record(name, sanitizeProps(props));
    if (this.queue().length >= this.flushAt) void this.flush();
    return event;
  }

  /** System events (`$screen`, `$survey_*`). */
  trackSystem(name: string, props: Props) {
    this.touch();
    return this.record(name, sanitizeProps(props));
  }

  /** Device → user alias. It does not rewrite events: the following ones carry the user_id. */
  identify(userId: string): Promise<void> {
    const id = String(userId ?? '').trim();
    if (!id || id.length > 128 || this.userId === id) return Promise.resolve();
    this.store.set(KEYS.user, id);
    return this.sendOrKeep({ path: '/sdk/identify', body: { device_id: this.deviceId, user_id: id } });
  }

  /** Logout in the app: the following events are anonymous again (same device_id). */
  reset() {
    this.store.remove(KEYS.user);
  }

  setTraits(traits: Props): Promise<void> {
    const clean = sanitizeTraits(traits ?? {});
    if (!Object.keys(clean).length) return Promise.resolve();
    const userId = this.userId;
    return this.sendOrKeep({
      path: '/sdk/traits',
      body: { device_id: this.deviceId, ...(userId ? { user_id: userId } : {}), traits: clean },
    });
  }

  /** Sends what is pending: identity operations first, then events in batches. Concurrent calls share one send. */
  flush(keepalive = false): Promise<void> {
    if (keepalive) return this.doFlush(true);
    return (this.flushing ??= this.doFlush(false).finally(() => (this.flushing = null)));
  }

  /** The tab is hidden or closing: saves the last activity and sends with `keepalive`. */
  onHidden() {
    const s = this.session();
    if (s) this.saveSession({ ...s, last: this.now() });
    void this.flush(true);
  }

  /** Visible again: after more than 30 min, the previous session is closed and a new one opens. */
  onVisible() {
    this.touch();
  }

  /** Sends an operation; when offline it stays pending and is retried on the next flush (the server is idempotent). */
  async sendOrKeep(op: PendingOp): Promise<void> {
    if (!this.send) {
      log('(dry run, not sent)', op.path, op.body);
      return;
    }
    if ((await this.client.post(op.path, op.body)) === 'retry') {
      const pending = readJson<PendingOp[]>(this.store, KEYS.pending) ?? [];
      writeJson(this.store, KEYS.pending, [...pending, op].slice(-MAX_PENDING_OPS));
    }
  }

  // ── internos ──

  private async doFlush(keepalive: boolean) {
    if (!this.send) return;
    try {
      await this.flushPendingOps(keepalive);
      for (;;) {
        let batch = this.queue()
          .filter((e) => !this.inflight.has(e.eventId))
          .slice(0, BATCH);
        if (!batch.length) return;
        let body = batch.map((e) => this.toApi(e));
        if (keepalive) {
          while (body.length > 1 && JSON.stringify(body).length > KEEPALIVE_BYTES) body = body.slice(0, body.length >> 1);
          batch = batch.slice(0, body.length);
        }
        const ids = batch.map((e) => e.eventId);
        ids.forEach((id) => this.inflight.add(id));
        let outcome: SendOutcome;
        try {
          outcome = await this.client.postEvents(body, keepalive);
        } finally {
          ids.forEach((id) => this.inflight.delete(id));
        }
        if (outcome === 'retry') return;
        if (outcome === 'drop') log(`${batch.length} event(s) rejected by the API`);
        const sent = new Set(ids);
        this.saveQueue(this.queue().filter((e) => !sent.has(e.eventId)));
        if (keepalive) return; // la página se va: un lote basta
      }
    } catch (e) {
      log('flush failed', e);
    }
  }

  private async flushPendingOps(keepalive: boolean) {
    const pending = readJson<PendingOp[]>(this.store, KEYS.pending);
    if (!pending?.length) return;
    this.store.remove(KEYS.pending);
    const remaining: PendingOp[] = [];
    for (const op of pending) {
      if ((await this.client.post(op.path, op.body, undefined, keepalive)) === 'retry') remaining.push(op);
    }
    if (remaining.length) {
      const now = readJson<PendingOp[]>(this.store, KEYS.pending) ?? [];
      writeJson(this.store, KEYS.pending, [...remaining, ...now].slice(-MAX_PENDING_OPS));
    }
  }

  private session(): Session | null {
    return readJson<Session>(this.store, KEYS.session);
  }

  private saveSession(s: Session) {
    writeJson(this.store, KEYS.session, s);
  }

  /** Activity now. Without a session or after 30 min idle: `$session_ended` for the previous one and `$session_started`. */
  private touch() {
    const now = this.now();
    const prev = this.session();
    if (prev && now - prev.last <= SESSION_TIMEOUT) {
      this.saveSession({ ...prev, last: now });
      return;
    }
    const next: Session = { id: uuid(), start: now, last: now };
    this.saveSession(next);
    if (prev) this.record('$session_ended', { duration_s: Math.floor((prev.last - prev.start) / 1000) }, prev.id, prev.last);
    this.record('$session_started', {}, next.id, now);
  }

  private record(name: string, props: Record<string, Json>, sessionId?: string, at?: number): SurveroEvent {
    const event: SurveroEvent = {
      eventId: uuid(),
      name,
      props,
      timestamp: at ?? this.now(),
      deviceId: this.deviceId,
      userId: this.userId,
      sessionId: sessionId ?? this.session()?.id ?? null,
    };
    for (const sink of [...this.sinks]) {
      try {
        sink(event);
      } catch (e) {
        log('sink failed', e);
      }
    }
    if (!this.send) {
      log('(dry run, not sent)', name, props);
      return event;
    }
    this.saveQueue([...this.queue(), event]);
    return event;
  }

  queue(): SurveroEvent[] {
    const cutoff = this.now() - QUEUE_MAX_AGE;
    const all = readJson<SurveroEvent[]>(this.store, KEYS.queue);
    return Array.isArray(all) ? all.filter((e) => e && e.eventId && e.timestamp >= cutoff).slice(-QUEUE_MAX) : [];
  }

  private saveQueue(events: SurveroEvent[]) {
    writeJson(this.store, KEYS.queue, events.slice(-QUEUE_MAX));
  }

  private toApi(e: SurveroEvent) {
    const c = this.context;
    return strip({
      event_id: e.eventId,
      event_name: e.name,
      device_id: e.deviceId,
      user_id: e.userId,
      session_id: e.sessionId,
      props: e.props,
      client_ts: new Date(e.timestamp).toISOString(),
      app_version: c.appVersion,
      platform: c.platform,
      sdk_version: c.sdkVersion,
      country: c.country,
      locale: c.locale,
    });
  }
}

/** Removes null keys (the server treats them the same, but the body is shorter). */
export function strip<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];
  return o;
}
