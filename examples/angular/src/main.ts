import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideSurvero } from '@survero/angular';
import { App } from './app/app';

// La clave PÚBLICA va en environment.ts (o en un config.json servido). Pruebas: ?key=…&api=…
const params = new URLSearchParams(location.search);
const api = params.get('api');

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideSurvero({ apiKey: params.get('key') ?? 'pk_live_REPLACE_ME', ...(api ? { baseUrl: api } : {}) }),
  ],
}).catch((e) => console.error(e));
