import { SurveroProvider, useSurvero } from '@survero/react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// La clave PÚBLICA va en una variable pública del bundler (Vite: VITE_*, Next.js: NEXT_PUBLIC_*).
// Las pruebas la pasan por la URL: ?key=…&api=…
const params = new URLSearchParams(location.search);
const apiKey = params.get('key') ?? import.meta.env.VITE_SURVERO_KEY ?? 'pk_live_REPLACE_ME';
const baseUrl = params.get('api') ?? import.meta.env.VITE_SURVERO_API_URL;

function App() {
  const [user, setUser] = useState<string>();
  // userId sigue a la sesión: identify al entrar, reset al salir.
  return (
    <SurveroProvider apiKey={apiKey} {...(baseUrl ? { baseUrl } : {})} {...(user ? { userId: user } : {})}>
      <Shop onLogin={() => setUser('demo-user')} />
    </SurveroProvider>
  );
}

function Shop({ onLogin }: { onLogin: () => void }) {
  const survero = useSurvero();
  const [path, setPath] = useState(location.pathname);
  return (
    <>
      <h1>Survero · React</h1>
      <p>
        Screen: <code>{path}</code>
      </p>
      <button onClick={() => survero.track('checkout_completed', { total: 42, express: true })}>Complete checkout</button>
      <button
        onClick={() => {
          onLogin();
          survero.setTraits({ plan: 'pro' });
        }}
      >
        Sign in as demo-user
      </button>
      <button
        onClick={() => {
          history.pushState(null, '', '/pricing/42' + location.search);
          setPath(location.pathname);
        }}
      >
        Go to pricing
      </button>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
