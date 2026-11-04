import { defineConfig } from '@playwright/test';

/**
 * Un ejemplo por adaptador contra el API local (http://localhost:4000). Cada ejemplo corre en su puerto: un origen
 * distinto del dashboard, así que también prueba el CORS abierto de las rutas SDK.
 */
export const EXAMPLES = { vanilla: 5101, react: 5102, vue: 5103, svelte: 5104, angular: 5105 } as const;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...(process.env['CHROME_BIN'] ? { launchOptions: { executablePath: process.env['CHROME_BIN'] } } : {}),
  },
  webServer: Object.entries(EXAMPLES).map(([name, port]) => ({
    command: `npm run dev -w example-${name}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  })),
});
