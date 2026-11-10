import { makeEnvironmentProviders, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { Survero as instance, type SurveroInstance, type SurveroOptions } from '@survero/web';

export {
  DEFAULT_BASE_URL,
  SDK_VERSION,
  screenName,
  type EligibleSurvey,
  type Props,
  type SurveroEvent,
  type SurveroOptions,
  type SurveroSink,
  type SurveroTheme,
  type SurveyAnswer,
  type SurveyOutcome,
  type SurveyRenderer,
} from '@survero/web';

/** Injection token: `private readonly survero = inject(Survero)`. */
export abstract class Survero {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Survero extends SurveroInstance {}

/**
 * `bootstrapApplication(App, { providers: [provideSurvero({ apiKey: environment.surveroKey })] })`. SSR-safe: it does
 * nothing on the server. `$screen` events come from Router navigation on their own (History API).
 */
export function provideSurvero(options: SurveroOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: Survero, useValue: instance },
    provideEnvironmentInitializer(() => instance.init(options)),
  ]);
}
