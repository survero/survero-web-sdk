import { Survero, type SurveroInstance, type SurveroOptions } from '@survero/web';
import { createContext, createElement, useContext, useEffect, useRef, type ReactNode } from 'react';

export * from '@survero/web';

const Context = createContext<SurveroInstance>(Survero);

export interface SurveroProviderProps extends SurveroOptions {
  children?: ReactNode;
}

/**
 * Starts Survero in the browser (it does nothing on the server). Put it once near the root: in the Next.js App Router,
 * in `app/layout.tsx`. `userId` follows your session: setting it calls `identify`, clearing it calls `reset`.
 */
export function SurveroProvider({ children, ...options }: SurveroProviderProps) {
  const previousUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    Survero.init(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.apiKey, options.baseUrl]);
  useEffect(() => {
    if (options.userId) Survero.identify(options.userId);
    else if (previousUser.current) Survero.reset();
    previousUser.current = options.userId;
  }, [options.userId]);
  return createElement(Context.Provider, { value: Survero }, children);
}

/** La instancia de Survero: `const survero = useSurvero(); survero.track('signup_completed')`. */
export function useSurvero(): SurveroInstance {
  return useContext(Context);
}
