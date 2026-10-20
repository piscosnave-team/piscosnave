/**
 * @spec-handoff
 * @interface CSP/SRI browser hardening for index.html
 * @behavior
 *   - CSP produces no violations or console errors across 3D, static, reduced-motion, landscape, gate, region, and no-JS paths
 *   - A tampered or blocked GSAP response leaves the static catalogue and order CTA usable
 * @edge-cases
 *   - Each 3D check owns and closes its Chromium process after stopping requestAnimationFrame
 *   - SRI rejection must degrade safely rather than leave a blank catalogue
 * @see ../../.yui-soul/reviews/341-piscosnave-review-340-remediation/spec.md (4.7)
 */
import { expect, test } from '@playwright/test';
import { expectedRed } from './helpers/expected-red.js';
import { ORIGIN } from './helpers/constants.js';
import { waitReady, waitSettled } from './helpers/ready.js';
import { runIn } from './helpers/projects.js';

runIn(test, 'desktop');

const GSAP = (url) => url.pathname.endsWith('/gsap.min.js');
const CDN = (url) => url.hostname === 'cdnjs.cloudflare.com';

async function catalogueAndOrderAreUsable(page) {
  await expect(page.locator('.ed-texto')).toHaveCount(3);
  await expect(page.locator('.ed-texto .precio')).toHaveCount(3);
  await expect(page.locator('.slot')).toHaveCount(3);
  await expect(page.locator('#ctaPedido')).toBeVisible();
  await page.locator('#ctaPedido').click({ trial: true });
}

async function newContext(browser, use, extra = {}) {
  return browser.newContext({
    baseURL: use.baseURL ?? ORIGIN,
    timezoneId: use.timezoneId,
    locale: use.locale,
    colorScheme: use.colorScheme,
    serviceWorkers: use.serviceWorkers,
    viewport: use.viewport,
    ...extra,
  });
}

async function assertCspClean(page, consoleErrors) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__cspViolations.push(event.effectiveDirective));
  });
  await page.goto('/?region=pe');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]'), 'the browser must receive the CSP meta before this check can prove its enforcement').toHaveCount(1);
  await waitReady(page);
  expect(await page.evaluate(() => window.__cspViolations), 'securitypolicyviolation events').toEqual([]);
  expect(consoleErrors, 'browser console errors').toEqual([]);
}

test.describe('H1 CSP browser enforcement', () => {
  test('the CSP keeps 3D, static, reduced-motion, landscape, age-gate, region-switch and no-JS paths console-clean', async ({ playwright }, testInfo) => {
    expectedRed(test, 'E10', 'the served page has no CSP meta, so a browser cannot enforce or validate the chosen policy');
    const use = testInfo.project.use;
    const browser = await playwright.chromium.launch({ args: use.launchOptions?.args });
    try {
      for (const mode of [
        { name: '3D', opts: {}, settle: true },
        { name: 'static', opts: { reducedMotion: 'reduce' } },
        { name: 'landscape', opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
        { name: 'no-JS', opts: { javaScriptEnabled: false }, noJs: true },
      ]) {
        const context = await newContext(browser, use, mode.opts);
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
          if (mode.noJs) {
            await page.goto('/?region=pe');
            await expect(page.locator('#edad')).toBeVisible();
            await expect(page.locator('.precio').first()).toBeVisible();
          } else {
            await assertCspClean(page, errors);
            if (mode.settle) {
              await waitSettled(page);
              await expect(page.locator('html')).toHaveAttribute('data-modo', '3d');
              await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
            }
          }
        } finally {
          await context.close();
        }
      }
      const gate = await newContext(browser, use);
      try {
        const page = await gate.newPage();
        const errors = [];
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await assertCspClean(page, errors);
        await page.locator('#edad-si').click();
        await page.goto('/?region=eu');
        await waitReady(page);
        expect(errors, 'gate flow and region switch console errors').toEqual([]);
        expect(await page.evaluate(() => window.__cspViolations), 'gate flow and region switch CSP violations').toEqual([]);
      } finally {
        await gate.close();
      }
    } finally {
      await browser.close();
    }
  });
});

test.describe('H2/H3 SRI and CDN failures fail safely', () => {
  for (const scenario of [
    { name: 'a tampered GSAP response', route: async (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* intentionally wrong SRI bytes */' }) },
    { name: 'a blocked CDN response', route: async (route) => route.abort() },
  ]) {
    test(`${scenario.name} leaves the static catalogue and order CTA usable`, async ({ playwright }, testInfo) => {
      expectedRed(test, 'E10', 'without SRI, tampered GSAP bytes execute or a CDN failure is not proven to be an integrity-safe fallback');
      const use = testInfo.project.use;
      const browser = await playwright.chromium.launch({ args: use.launchOptions?.args });
      try {
        const context = await newContext(browser, use);
        try {
          const page = await context.newPage();
          await page.route(scenario.name.includes('tampered') ? GSAP : CDN, scenario.route);
          await page.addInitScript(() => { try { localStorage.setItem('nave-edad', 'si'); } catch (e) {} });
          await page.goto('/?region=pe');
          await expect(page.locator('script[src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"]'), 'the browser can only reject a tampered GSAP body when the tag carries an SRI hash').toHaveAttribute('integrity', /^sha512-/);
          await expect(page.locator('meta[http-equiv="Content-Security-Policy"]'), 'the CDN-failure procedure runs under the final CSP, not an unprotected page').toHaveCount(1);
          await waitReady(page);
          await expect(page.locator('html')).toHaveAttribute('data-modo', 'estatica');
          await expect(page.locator('html')).toHaveAttribute('data-motivo', 'sin-gsap');
          await catalogueAndOrderAreUsable(page);
          await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    });
  }
});
