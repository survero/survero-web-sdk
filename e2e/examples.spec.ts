import { expect, test, type Page } from '@playwright/test';
import { EXAMPLES } from '../playwright.config';

const API = process.env['SURVERO_API_URL'] ?? 'http://localhost:4000/api/v1';

/** Lo que haría el agente: proyecto reclamable + una encuesta con la sk_. */
async function setupProject(name: string) {
  const ip = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const res = await fetch(`${API}/projects/claimable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ name: `example ${name}`, platform: 'web' }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const project = (await res.json()) as { public_key: string; secret_key: string };
  const survey = await fetch(`${API}/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${project.secret_key}` },
    body: JSON.stringify({
      title: 'Checkout feedback',
      slug: 'checkout-feedback',
      type: 'single_choice',
      status: 'active',
      trigger_event: 'checkout_completed',
      rules: { all: [{ event_count: { name: 'checkout_completed', gte: 1 } }] },
      copy: {
        question: { en: 'How easy was checkout?' },
        options: [
          { key: 'easy', label: { en: 'Easy' } },
          { key: 'hard', label: { en: 'Hard' } },
        ],
        followup: { prompt: { en: 'What got in the way?' }, for_keys: ['hard'] },
        submit: { en: 'Send' },
      },
      reading_threshold: 'Read at n ≥ 50; > 20 % hard = fix checkout.',
    }),
  });
  expect(survey.status, await survey.clone().text()).toBe(201);
  return project;
}

interface LiveEvent {
  event_name: string;
  props: Record<string, unknown>;
  platform: string;
  sdk_version: string;
  user_id: string | null;
}

async function liveEvents(sk: string): Promise<LiveEvent[]> {
  const res = await fetch(`${API}/events/live?limit=200`, { headers: { Authorization: `Bearer ${sk}` } });
  const body = (await res.json()) as LiveEvent[] | { events: LiveEvent[] };
  return Array.isArray(body) ? body : body.events;
}

async function run(page: Page, port: number, pk: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/?key=${pk}&api=${encodeURIComponent(API)}`);
  await page.getByRole('button', { name: 'Sign in as demo-user' }).click();
  await page.getByRole('button', { name: 'Go to pricing' }).click();
  await expect(page.locator('code')).toHaveText('/pricing/42');
  await page.getByRole('button', { name: 'Complete checkout' }).click();

  // La encuesta sale sola: checkout_completed es su disparador. Playwright atraviesa el Shadow DOM.
  const dialog = page.getByRole('dialog', { name: 'How easy was checkout?' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: 'Easy' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Hard' }).click();
  const text = dialog.getByRole('textbox', { name: 'What got in the way?' });
  await expect(text).toBeFocused();
  await text.fill('The coupon field');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog).toBeHidden();
  return errors;
}

for (const [name, port] of Object.entries(EXAMPLES)) {
  test(`${name}: eventos, identidad, $screen y encuesta contra el API`, async ({ page }) => {
    const project = await setupProject(name);
    const errors = await run(page, port, project.public_key);

    await expect
      .poll(async () => (await liveEvents(project.secret_key)).map((e) => e.event_name).sort(), { timeout: 20_000 })
      .toEqual(
        expect.arrayContaining(['$install', '$session_started', '$screen', 'checkout_completed', '$survey_shown', '$survey_answered']),
      );
    const events = await liveEvents(project.secret_key);
    const checkout = events.find((e) => e.event_name === 'checkout_completed')!;
    expect(checkout).toMatchObject({ platform: 'web', sdk_version: 'web/0.1.0', user_id: 'demo-user', props: { total: 42, express: 1 } });
    const screens = events.filter((e) => e.event_name === '$screen').map((e) => e.props['name']);
    expect(screens).toEqual(expect.arrayContaining(['/', '/pricing/:id']));
    expect(events.find((e) => e.event_name === '$survey_answered')!.props).toMatchObject({
      survey: 'checkout-feedback',
      answer_key: 'hard',
      has_text: 1,
    });

    const results = await fetch(`${API}/metrics/survey_results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${project.secret_key}` },
      body: JSON.stringify({ survey: 'checkout-feedback' }),
    });
    const { data } = (await results.json()) as { data: { n: number; impressions: number; segments: { tallies: { answer_key: string; n: number }[] }[] } };
    expect(data).toMatchObject({ n: 1, impressions: 1 });
    expect(data.segments[0]!.tallies.find((t) => t.answer_key === 'hard')!.n).toBe(1);
    expect(errors).toEqual([]);
  });
}
