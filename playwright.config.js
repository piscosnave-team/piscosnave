// @ts-check
import { defineConfig } from '@playwright/test';
import { FIXTURE, ORIGIN, PORT, SWIFTSHADER_ARGS } from './tests/e2e/helpers/constants.js';

/**
 * Projects (spec 4.11):
 *   static          static layer, no browser is launched (npm run validate)
 *   desktop         1280x800
 *   mobile-375      375x667, DPR 2, isMobile, hasTouch
 *   reduced-motion  desktop + prefers-reduced-motion: reduce (static layout)
 *   landscape       844x390, DPR 2, isMobile (tests also set 740x360 and 667x375)
 *   visual          local-only visual regression (npm run test:visual), never in CI
 * Every browser project pins timezone and locale (I-41) so the page's region default
 * (America/* -> PE) is deterministic. Tests choose the region with ?region= (see helpers/page.js).
 */
const pinned = {
  baseURL: ORIGIN,
  timezoneId: FIXTURE.timezoneId,
  locale: FIXTURE.locale,
  colorScheme: /** @type {const} */ ('light'),
  serviceWorkers: /** @type {const} */ ('block'),
};
const swiftshader = { launchOptions: { args: SWIFTSHADER_ARGS } };

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // SwiftShader renders the WebGL scene in software, so each 3D page is CPU-heavy: keep parallelism low
  // (override with PW_WORKERS). Static specs are cheap either way.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 2,
  retries: 0, // flaky = blocking: never retry a test into green
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: {
    timeout: 5_000,
    // Visual regression (sub-decision h1): strict, local-only, canvas masked by the specs.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2, animations: 'disabled' },
  },
  webServer: {
    command: 'node tests/e2e/helpers/static-server.mjs',
    url: `${ORIGIN}/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    {
      name: 'static',
      testDir: './tests/static',
      testMatch: '**/*.spec.js',
    },
    {
      name: 'desktop',
      testDir: './tests/e2e',
      testMatch: '**/*.spec.js',
      use: { ...pinned, ...swiftshader, viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-375',
      testDir: './tests/e2e',
      testMatch: '**/*.spec.js',
      use: {
        ...pinned,
        ...swiftshader,
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'reduced-motion',
      testDir: './tests/e2e',
      testMatch: '**/*.spec.js',
      use: { ...pinned, viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' },
    },
    {
      name: 'landscape',
      testDir: './tests/e2e',
      testMatch: '**/*.spec.js',
      use: {
        ...pinned,
        ...swiftshader,
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'visual',
      testDir: './tests/visual',
      testMatch: '**/*.spec.js',
      use: { ...pinned, viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' },
    },
  ],
});
