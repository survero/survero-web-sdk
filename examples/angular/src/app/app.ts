import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Survero } from '@survero/angular';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Survero · Angular</h1>
    <p>Screen: <code>{{ path() }}</code></p>
    <button type="button" (click)="checkout()">Complete checkout</button>
    <button type="button" (click)="login()">Sign in as demo-user</button>
    <button type="button" (click)="pricing()">Go to pricing</button>
  `,
})
export class App {
  private readonly survero = inject(Survero);
  protected readonly path = signal(location.pathname);

  checkout() {
    this.survero.track('checkout_completed', { total: 42, express: true });
  }

  login() {
    this.survero.identify('demo-user');
    this.survero.setTraits({ plan: 'pro' });
  }

  pricing() {
    history.pushState(null, '', '/pricing/42' + location.search);
    this.path.set(location.pathname);
  }
}
