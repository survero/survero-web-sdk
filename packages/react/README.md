# @survero/react

[Survero](https://www.npmjs.com/package/@survero/web) for React and Next.js: product events, identity and in-app
micro-surveys. Re-exports everything from `@survero/web`.

> **Using an AI agent?** `npx survero init` sets this up for you.

```bash
npm install @survero/react
```

## Next.js (App Router)

```tsx
// app/layout.tsx — SurveroProvider is a client component; the layout can stay a server component.
import { SurveroProvider } from '@survero/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SurveroProvider apiKey={process.env.NEXT_PUBLIC_SURVERO_KEY!}>{children}</SurveroProvider>
      </body>
    </html>
  );
}
```

```tsx
'use client';
import { useSurvero } from '@survero/react';

export function CheckoutButton() {
  const survero = useSurvero();
  return <button onClick={() => survero.track('checkout_completed', { total: 42 })}>Pay</button>;
}
```

Page views are tracked automatically on every route change (`$screen`).

## Vite / CRA

```tsx
createRoot(root).render(
  <SurveroProvider apiKey={import.meta.env.VITE_SURVERO_KEY}>
    <App />
  </SurveroProvider>,
);
```

## Login and logout

Pass `userId` and keep it in sync with your session: setting it calls `identify`, clearing it calls `reset`.

```tsx
<SurveroProvider apiKey={key} userId={session?.user.id}>
```

Surveys, options, sinks and behavior: see [`@survero/web`](https://www.npmjs.com/package/@survero/web).
