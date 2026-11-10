import { log } from './store';

/** Names: snake_case ≤ 40. Same as the server. */
export const NAME = /^[a-z][a-z0-9_]{0,39}$/;

/** Keys the SDK sets itself or that are columns on the server: inside props the server would reject the event. */
export const RESERVED_PROPS = new Set(
  'platform app_version sdk_version country country_ip locale user_id device_id session_id source environment event_id event_name client_ts server_ts project_id identity'.split(
    ' ',
  ),
);

export type Props = Record<string, unknown>;
export type Json = string | number | null | Json[] | { [k: string]: Json };

/** Already warned about (once per key: do not flood the console when tracking in a loop). */
const warned = new Set<string>();

/**
 * Props ready for JSON: booleans → 0/1, Date → ISO, recursive; non-finite numbers and functions dropped. Reserved keys
 * are removed (otherwise the server would reject the whole event) with a console warning, so they never vanish silently.
 */
export function sanitizeProps(props?: Props | null): Record<string, Json> {
  const out: Record<string, Json> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (RESERVED_PROPS.has(key)) {
      if (!warned.has(key)) {
        warned.add(key);
        log(`prop "${key}" is reserved and was dropped (the SDK sets it, or it is a column). Rename it, e.g. "${key}_name" or "entry_${key}". Reserved: ${[...RESERVED_PROPS].join(', ')}`);
      }
      continue;
    }
    if (!key || key.length > 64) continue;
    const v = clean(value, 0);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function clean(value: unknown, depth: number): Json | undefined {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
      return value;
    case 'boolean':
      return value ? 1 : 0;
    case 'number':
      return Number.isFinite(value) ? value : undefined;
    case 'bigint':
      return value.toString();
    case 'object': {
      if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value.toISOString();
      if (depth > 5) return undefined;
      if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1)).filter((v) => v !== undefined) as Json[];
      const out: Record<string, Json> = {};
      for (const [k, v] of Object.entries(value as object)) {
        const c = clean(v, depth + 1);
        if (c !== undefined) out[k] = c;
      }
      return out;
    }
    default:
      return undefined; // undefined, function, symbol
  }
}

/** Traits: null deletes the key; text ≤ 256; numbers and booleans as they are; anything else as text. */
export function sanitizeTraits(traits: Props): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(traits)) {
    if (!NAME.test(key)) {
      log(`ignored trait "${key}": keys must be snake_case, ≤ 40 chars`);
      continue;
    }
    if (value === null || value === undefined) out[key] = null;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else out[key] = String(value instanceof Date ? value.toISOString() : value).slice(0, 256);
  }
  return out;
}

/** `es-CO` → `CO`. It is the language's region, not IP geolocation. */
export function countryFromLocale(locale?: string | null): string | null {
  const part = locale?.split(/[-_]/).slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
  return part ? part.toUpperCase() : null;
}
