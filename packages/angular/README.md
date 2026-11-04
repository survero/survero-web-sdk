# @survero/angular

[Survero](https://www.npmjs.com/package/@survero/web) for Angular 19+ (standalone, SSR-safe): product events,
identity and in-app micro-surveys.

> **Using an AI agent?** `npx survero init` sets this up for you.

```bash
npm install @survero/angular
```

```ts
// app.config.ts
import { provideSurvero } from '@survero/angular';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideSurvero({ apiKey: environment.surveroKey })],
};
```

```ts
import { Component, inject } from '@angular/core';
import { Survero } from '@survero/angular';

@Component({ selector: 'app-checkout', template: `<button (click)="pay()">Pay</button>` })
export class Checkout {
  private readonly survero = inject(Survero);

  pay() {
    this.survero.track('checkout_completed', { total: 42 });
  }
}
```

The public key (`pk_…`) is safe in `environment.ts`. Router navigations are tracked automatically (`$screen`). With
SSR, every call is a no-op on the server.

Surveys, options, sinks and behavior: see [`@survero/web`](https://www.npmjs.com/package/@survero/web).
