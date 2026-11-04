/**
 * Almacén clave → JSON. `localStorage` si existe (compartido entre pestañas: se lee en cada operación, nunca se
 * cachea, para que dos pestañas no se pisen la cola o la sesión); si no (SSR, modo privado estricto), memoria.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

export function browserStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = '__survero_probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      get: (k) => ls.getItem(k),
      // Cuota llena: se pierde la escritura, nunca se lanza hacia la app.
      set: (k, v) => {
        try {
          ls.setItem(k, v);
        } catch {
          /* cuota */
        }
      },
      remove: (k) => ls.removeItem(k),
    };
  } catch {
    return memoryStore();
  }
}

export function readJson<T>(store: KeyValueStore, key: string): T | null {
  try {
    const raw = store.get(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export const writeJson = (store: KeyValueStore, key: string, value: unknown) => store.set(key, JSON.stringify(value));

export const log = (...args: unknown[]) => console.warn('Survero:', ...args);

export const uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
