import { Survero, type SurveroInstance, type SurveroOptions } from '@survero/web';
import { createContext, createElement, useContext, useEffect, useRef, type ReactNode } from 'react';

export * from '@survero/web';

const Context = createContext<SurveroInstance>(Survero);

export interface SurveroProviderProps extends SurveroOptions {
  children?: ReactNode;
}

/**
 * Inicializa Survero en el navegador (en el servidor no hace nada). Ponlo una vez cerca de la raíz: en Next.js App
 * Router, en `app/layout.tsx`. `userId` sigue a tu sesión: al ponerlo se llama `identify`, al quitarlo `reset`.
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
