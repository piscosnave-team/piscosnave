/**
 * @spec-handoff
 * @interface Playwright smoke S1, S3, S4, S5, S6 against the page as served (characterization of today's behaviour)
 * @behavior
 *   - S1: 3D stage loads (data-modo=3d via con-3d until E7), 0 pageerror, 0 console error, 0 failed request, 0 HTTP >= 400
 *   - S3: PE <-> EU switch updates lang, price, title, storage and every wa.me link; stored region wins on reload;
 *     with no ?region the timezone decides (America/Lima -> PE, Europe/Madrid -> EU)
 *   - S4: picking an edition updates #ctaTexto/#ctaPedido; picking it again resets; #lasTres shows the collection total
 *   - S5: data-ir links reach their segment, #marca anchor works, legal toggles open/close with aria-expanded
 *   - S6: no horizontal overflow at 320, 375 and 768 through a full scroll sweep; header controls inside the viewport at 320
 *   - P1 (E5): first view at mobile-375 (DPR 2, no stored consent) weighs <= 307,200 B: gzip -9 for text, raw for images;
 *     3D library, textures, js/escena.js and lazy images excluded; desktop total is logged, never asserted
 * @edge-cases
 *   - the WhatsApp number is read from window.NAVE_CONFIG at runtime, never written in a test (owner-gated, TC15)
 *   - S3/S4 double as characterization of owner-gated values: prices and message text must not change in this PR
 *   - mode-aware: after E7 the same specs must pass in static mode (no pin) - helpers handle both
 * @see ./helpers/page.js
 * @see ./helpers/scroll.js
 * @see ./helpers/budget.js
 */
import { expectedRed } from './helpers/expected-red.js';
import { runIn } from './helpers/projects.js';
import { configuredNumbers, expect, openPage, test, waNumberOf, waTextOf } from './helpers/page.js';
import { BUDGET_BYTES, trackFirstView } from './helpers/budget.js';
import { getModo, waitSettled } from './helpers/ready.js';
import { pinRange, scrollToOrderWidget, waitScrollIdle } from './helpers/scroll.js';

const TITLE = { pe: 'NAVE | Pisco Premium de Ica, Perú', eu: 'NAVE | Premium Pisco from Ica, Peru' };

test.describe('S1 smoke: the page loads', () => {
  runIn(test, 'desktop', 'mobile-375');

  test('S1 the 3D stage loads with no uncaught errors and no failed requests', async ({ page, errors }) => {
    await openPage(page);
    await waitSettled(page);
    expect(await getModo(page), 'WebGL must be available (SwiftShader args, TC14): a silent fallback to static must fail loudly').toBe('3d');
    await expect(page.locator('h1')).toHaveText('El alma del Perú en cada gota');
    await expect(page).toHaveTitle(TITLE.pe);
    await expect(page.locator('#inicio')).toHaveCount(1);
    await expect(page.locator('#marca')).toHaveCount(1);
    await expect(page.locator('footer.pie')).toHaveCount(1);
    expect(errors, 'errors collected during load').toEqual({ pageErrors: [], consoleErrors: [], failedRequests: [], badResponses: [] });
  });
});

test.describe('S3 region switch', () => {
  runIn(test, 'desktop');
  // Region logic lives in the classic script and does not depend on the 3D scene: run it on the cheap static
  // path (reduced motion) so the suite stays fast. The 3D path is covered by S1, S4 and S5.
  test.use({ reducedMotion: 'reduce' });

  test('S3 switching to EU updates language, price, title and WhatsApp links; the stored choice wins on reload', async ({ page }) => {
    await openPage(page, { region: 'pe' });
    const nums = await configuredNumbers(page);
    expect(nums.pe, 'a PE WhatsApp number must be configured').not.toBe('');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');
    await expect(page.locator('.precio').first()).toContainText('S/ 50');
    await expect(page).toHaveTitle(TITLE.pe);
    for (const href of await page.locator('[data-wa]').evaluateAll((els) => els.map((a) => a.getAttribute('href')))) {
      expect(href.startsWith('https://wa.me/')).toBe(true);
      expect(waNumberOf(href)).toBe(nums.pe);
      expect(waTextOf(href)).toMatch(/^Hola/);
    }

    await page.locator('header [data-region="eu"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.precio').first()).toContainText('€40');
    await expect(page).toHaveTitle(TITLE.eu);
    expect(await page.evaluate(() => localStorage.getItem('nave-region'))).toBe('eu');
    for (const href of await page.locator('[data-wa]').evaluateAll((els) => els.map((a) => a.getAttribute('href')))) {
      expect(href.startsWith('https://wa.me/')).toBe(true);
      expect(waNumberOf(href)).toBe(nums.eu);
      expect(waTextOf(href)).toMatch(/^Hello/);
    }

    await openPage(page, { region: null }); // no ?region: the stored choice must win over the timezone (America/Lima)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(TITLE.eu);
  });

  test('S3 with no ?region and no stored choice the timezone decides: America/Lima -> PE', async ({ page }) => {
    await openPage(page, { region: null });
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');
  });

  test.describe('Europe/Madrid', () => {
    test.use({ timezoneId: 'Europe/Madrid' });
    test('S3 with no ?region and no stored choice the timezone decides: Europe/Madrid -> EU', async ({ page }) => {
      await openPage(page, { region: null });
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('.precio').first()).toContainText('€40');
    });
  });
});

const ORDER_CASES = [
  { region: 'pe', base: 'Pedir por WhatsApp', una: 'Pedir Sunqu por WhatsApp', tres: 'Pedir las tres por WhatsApp', total: 'S/ 150' },
  { region: 'eu', base: 'Order on WhatsApp', una: 'Order Sunqu on WhatsApp', tres: 'Order all three on WhatsApp', total: '€120' },
];

test.describe('S4 order flow', () => {
  // desktop only: the 375px 3D page costs ~40 s per test under software GL (it passes there, but too slow for the suite)
  runIn(test, 'desktop');

  for (const c of ORDER_CASES) {
    test(`S4 picking an edition updates the CTA and the wa.me link; picking it again clears it (${c.region})`, async ({ page }) => {
      await openPage(page, { region: c.region });
      const nums = await configuredNumbers(page);
      await scrollToOrderWidget(page);
      const cta = page.locator('#ctaPedido');
      const text = page.locator('#ctaTexto');
      const sunqu = page.locator('#trioArcos .slot[data-ed="Sunqu"]');

      await expect(text).toHaveText(c.base);
      await sunqu.click();
      await expect(text).toHaveText(c.una);
      await expect(sunqu).toHaveAttribute('aria-pressed', 'true');
      const href = await cta.getAttribute('href');
      expect(href.startsWith('https://wa.me/')).toBe(true);
      expect(waNumberOf(href)).toBe(nums[c.region]);
      expect(waTextOf(href)).toContain('Sunqu');

      await sunqu.click();
      await expect(text).toHaveText(c.base);
      await expect(sunqu).toHaveAttribute('aria-pressed', 'false');
      expect(waTextOf(await cta.getAttribute('href'))).not.toContain('Sunqu');

      await page.locator('#lasTres').click();
      await expect(text).toHaveText(c.tres);
      await expect(page.locator('#lasTres')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#ctaNota')).toContainText(c.total);
      expect(waNumberOf(await cta.getAttribute('href'))).toBe(nums[c.region]);
    });
  }
});

test.describe('S5 navigation', () => {
  runIn(test, 'desktop');

  const inViewport = (page, selector) =>
    page.locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });

  test('S5 hero and header data-ir links reach their segment', async ({ page }) => {
    await openPage(page);
    await waitSettled(page);
    const pin = await pinRange(page);

    await page.locator('.h-texto .acciones a[data-ir="4.75"]').click();
    await waitScrollIdle(page);
    if (pin) expect(Math.abs((await page.evaluate(() => scrollY)) - (pin.start + (pin.end - pin.start) * (4.75 / 5)))).toBeLessThan(5);
    expect(await inViewport(page, '#ctaPedido'), 'the order button is in view after "Elegir mi edición"').toBe(true);

    await page.locator('header nav a[data-ir="1"]').click();
    await waitScrollIdle(page);
    if (pin) expect(Math.abs((await page.evaluate(() => scrollY)) - (pin.start + (pin.end - pin.start) * (1 / 5)))).toBeLessThan(5);
    else expect(await inViewport(page, '.ed-texto')).toBe(true);
  });

  test('S5 the "Nuestra historia" anchor lands on #marca', async ({ page }) => {
    await openPage(page);
    await waitSettled(page);
    await page.locator('header nav a[href="#marca"]').click();
    await waitScrollIdle(page);
    const top = await page.locator('#marca').evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThan(80);
  });

  test.describe('legal toggles', () => {
    test.use({ reducedMotion: 'reduce' }); // mode-independent behaviour: use the cheap static path

    test('S5 footer legal links open and close their panel and keep aria-expanded in sync', async ({ page }) => {
      await openPage(page);
      const link = page.locator('.pie-nav a[data-abre="aviso"]');
      const panel = page.locator('#aviso');
      await link.click();
      await expect(panel).toHaveJSProperty('open', true);
      await expect(link).toHaveAttribute('aria-expanded', 'true');
      await link.click();
      await expect(panel).toHaveJSProperty('open', false);
      await expect(link).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

const WIDTHS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
];

test.describe('S6 no horizontal overflow', () => {
  runIn(test, 'desktop');

  for (const { width, height } of WIDTHS) {
    test.describe(`${width}px`, () => {
      // DPR 1: overflow does not depend on pixel density, and a 2x canvas makes software-GL frames 4x slower
      test.use({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

      test(`S6 no horizontal overflow at ${width}px through a full scroll sweep`, async ({ page }) => {
        await openPage(page);
        const sweep = await page.evaluate(async () => {
          let max = 0;
          for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
            window.scrollTo({ top: y, behavior: 'instant' });
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            max = Math.max(max, document.documentElement.scrollWidth, document.body.scrollWidth);
          }
          return { max, viewport: innerWidth };
        });
        expect(sweep.max, `widest scrollWidth during the sweep vs viewport ${sweep.viewport}`).toBeLessThanOrEqual(sweep.viewport);
      });

      if (width === 320) {
        test.describe('header geometry', () => {
          test.use({ reducedMotion: 'reduce' }); // layout of the fixed header does not depend on the 3D scene

          test('S6b header controls (region switch, Pedidos) are fully inside the 320px viewport', async ({ page }) => {
            // NEW finding surfaced while writing this harness (not in report 340): at 320px the "Pedidos" button ends at
            // x=321 (1px past the viewport, ignoring the 18px gutter). body{overflow-x:clip} hides it from the S6 scrollWidth
            // check, so only a geometric check sees it. Owner step: none scheduled; Yui must assign it (E9 is the closest
            // fit: short/narrow viewports) or delete this test. See the E3 report.
            expectedRed(test, 'E9', 'header nav overruns the 320px viewport by 1px ("Pedidos" right edge at 321)');
            await openPage(page, { wait: false });
            const outside = await page.locator('.cabecera .region, .cabecera .boton').evaluateAll((els) =>
              els
                .map((el) => ({ cls: el.className, r: el.getBoundingClientRect() }))
                .filter((x) => x.r.width > 0 && (x.r.left < 0 || x.r.right > innerWidth))
                .map((x) => `${x.cls}: ${x.r.left}..${x.r.right} of ${innerWidth}`),
            );
            expect(outside, 'header controls outside the viewport').toEqual([]);
          });
        });
      }
    });
  }
});

test.describe('P1 first-view budget (spec 4.6)', () => {
  test.describe('mobile-375', () => {
    runIn(test, 'mobile-375');

    test('P1 the first view weighs at most 300 KB (gzip -9 text, raw images, without the 3D library, textures and lazy images)', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const view = trackFirstView(page);
      await openPage(page, { consent: false }); // fresh context, no stored consent: the age gate is part of the first view
      const report = await view.report();
      console.log(`[P1 mobile-375]\n${report.breakdown}`);
      await testInfo.attach('first-view-breakdown', { body: report.breakdown, contentType: 'text/plain' });
      expect(report.rows.some((r) => r.type.includes('html')), 'the document itself was measured').toBe(true);
      expect(report.total, `first-view bytes (see breakdown above); hero candidate: ${report.hero.startsWith('data:') ? 'inline data URI' : report.hero}`).toBeLessThanOrEqual(BUDGET_BYTES);
    });
  });

  test.describe('desktop (informational)', () => {
    runIn(test, 'desktop');

    test('P1 desktop first-view total is logged, not asserted', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const view = trackFirstView(page);
      await openPage(page, { consent: false });
      const report = await view.report();
      console.log(`[P1 desktop, informational]\n${report.breakdown}`);
      await testInfo.attach('first-view-breakdown-desktop', { body: report.breakdown, contentType: 'text/plain' });
      expect(report.rows.some((r) => r.type.includes('html')), 'the document itself was measured').toBe(true);
    });
  });
});
