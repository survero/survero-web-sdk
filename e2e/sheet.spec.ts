import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { EXAMPLES } from '../playwright.config';

/**
 * La hoja con una API falsa (sin servidor): accesibilidad (axe, WCAG AA) en claro y oscuro, escritorio y móvil,
 * foco atrapado, y capturas en test-results/.
 */
const SURVEY = {
  id: 'svy-1',
  slug: 'nps',
  type: 'nps',
  locale: 'en',
  copy: { question: 'How likely are you to recommend us to a friend?', followup: { prompt: 'What is the main reason?' }, submit: 'Send' },
  scale: { min: 0, max: 10 },
  style: { primaryColor: '#E30B5C', borderRadius: 12 },
};

for (const scheme of ['light', 'dark'] as const) {
  for (const [device, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    test(`hoja ${scheme} ${device}: axe sin violaciones, foco atrapado, Esc`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.route('http://fake.api/**', (route) => {
        const url = new URL(route.request().url());
        const body = url.pathname.endsWith('/eligible') ? { survey: SURVEY } : url.pathname.endsWith('/triggers') ? { triggers: [] } : {};
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      });
      await page.goto(`http://localhost:${EXAMPLES.vanilla}/?key=pk_live_fake&api=http://fake.api/api/v1`);
      await page.evaluate(() => void (window as any).Survero.surveys.show('nps'));
      const dialog = page.getByRole('dialog', { name: SURVEY.copy.question });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: '9', exact: true }).click();
      await expect(dialog.getByRole('textbox', { name: 'What is the main reason?' })).toBeFocused();
      await page.waitForTimeout(250); // animación de entrada
      await page.screenshot({ path: info.outputPath(`sheet-${scheme}-${device}.png`) });

      const axe = await new AxeBuilder({ page }).include('survero-survey').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

      // Tab no sale de la hoja.
      for (let i = 0; i < 16; i++) await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SURVERO-SURVEY');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });
  }
}

test('<script data-key>: se inicializa solo y envía', async ({ page }) => {
  const sent: string[] = [];
  await page.route('http://fake.api/**', (route) => {
    const body = route.request().postData();
    if (body) sent.push(...(JSON.parse(body).events ?? []).map((e: { event_name: string }) => e.event_name));
    return route.fulfill({ status: 202, contentType: 'application/json', body: '{"triggers":[]}', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  });
  await page.goto(`http://localhost:${EXAMPLES.vanilla}/404.html`).catch(() => {});
  await page.setContent(
    `<script src="http://localhost:${EXAMPLES.vanilla}/survero.js" data-key="pk_live_fake" data-base-url="http://fake.api/api/v1"></script>`,
  );
  await page.evaluate(() => {
    (window as any).Survero.track('pricing_viewed');
    return (window as any).Survero.flush();
  });
  expect(sent).toEqual(expect.arrayContaining(['$install', '$session_started', 'pricing_viewed']));
});
