/**
 * Test fixtures and navigation. Everything is deterministic: timezone and locale come from the
 * project config, the region is chosen explicitly with ?region= (I-41), and the age gate is bypassed
 * by seeding localStorage before the page scripts run unless a test says otherwise.
 */
import { expect, test as base } from '@playwright/test';
import { FIXTURE } from './constants.js';
import { waitReady } from './ready.js';

/**
 * `errors` collects everything that must be empty on a healthy load:
 *   pageErrors      uncaught exceptions
 *   consoleErrors   console.error only (SwiftShader emits harmless console warnings)
 *   failedRequests  requests that failed at the network level
 *   badResponses    HTTP status >= 400
 */
export const test = base.extend({
  errors: async ({ page }, use) => {
    const errors = { pageErrors: [], consoleErrors: [], failedRequests: [], badResponses: [] };
    page.on('pageerror', (e) => errors.pageErrors.push(String(e.message || e)));
    page.on('console', (m) => m.type() === 'error' && errors.consoleErrors.push(m.text()));
    page.on('requestfailed', (r) => errors.failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ''}`.trim()));
    page.on('response', (r) => r.status() >= 400 && errors.badResponses.push(`${r.status()} ${r.url()}`));
    await use(errors);
  },
});
export { expect };

/**
 * @param {import('@playwright/test').Page} page
 * @param {{region?: 'pe'|'eu'|null, consent?: boolean, wait?: boolean}} [opts]
 *   region: ?region= value (default 'pe'; null = no query, so stored choice / timezone decide)
 *   consent: seed localStorage nave-edad=si so the age gate does not open (default true)
 */
export async function openPage(page, { region = FIXTURE.region, consent = true, wait = true } = {}) {
  if (consent) await page.addInitScript(() => { try { localStorage.setItem('nave-edad', 'si'); } catch (e) { /* storage blocked */ } });
  await page.goto(region ? `/?region=${region}` : '/');
  if (wait) await waitReady(page);
}

/** WhatsApp numbers as the page configures them, read at runtime (never hard-coded in tests). */
export async function configuredNumbers(page) {
  return page.evaluate(() => {
    const w = (window.NAVE_CONFIG && window.NAVE_CONFIG.WHATSAPP) || {};
    return { pe: String(w.pe || '').replace(/\D/g, ''), eu: String(w.eu || '').replace(/\D/g, '') };
  });
}

/** Digits of the number in a wa.me href. */
export const waNumberOf = (href) => (/^https:\/\/wa\.me\/(\d*)\?/.exec(href) || [])[1];
/** Decoded ?text= of a wa.me href. */
export const waTextOf = (href) => decodeURIComponent((/[?&]text=([^&]*)/.exec(href) || [, ''])[1]);
