/**
 * @spec-handoff
 * @interface age gate #edad: visible in the served HTML, dismissed before first paint by the head boot script (spec 4.2)
 * @behavior
 *   - S2a: the served HTML has #edad without a `hidden` attribute
 *   - S2b: no storage -> gate visible, #edad-si focused, html overflow hidden, Tab/Shift+Tab/Escape never leave or close it
 *   - S2c: #edad-no shows the minors text and keeps the gate; #edad-si hides it, stores nave-edad=si, restores overflow, reload keeps it hidden
 *   - S2d: seeded consent -> a rAF sampler never sees #edad with display other than none (also with every other script aborted)
 *   - S2e: js/*, cdnjs/jsdelivr and vendor/* aborted -> the gate is still visible and dismissable. S2f: localStorage throwing -> no error
 *   - E8 (I-05): header/main/footer inert while open; after confirming inert is removed, focus is on the h1, `nave:edad-ok` fires
 *   - E9 (I-10, S2g): at 640x360 and 568x320 .edad-caja scrolls (overflow-y auto) and both buttons can be reached and clicked
 * @edge-cases
 *   - storage key/value/semantics unchanged (nave-edad = si); the gate stays a declarative self-declaration
 *   - tests marked green today are guards for the inversion (gate visible by default): they must stay green
 * @see ./resilience.spec.js
 */
import { expectedRed } from './helpers/expected-red.js';
import { expect, openPage, test } from './helpers/page.js';
import { runIn } from './helpers/projects.js';

runIn(test, 'desktop');

const MINORS_PE = 'El acceso está reservado a personas de 18 años o más.';
const nonBoot = (url) => url.pathname.startsWith('/js/') || url.pathname.includes('/vendor/') || /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)$/.test(url.hostname);
const abort = (route) => route.abort();

/** Fresh visit, no stored consent; does not wait for the 3D/static readiness (the gate must not depend on it). */
async function openFresh(page) {
  await openPage(page, { consent: false, wait: false });
  await page.waitForLoadState('domcontentloaded');
}

const storedEdad = (page) => page.evaluate(() => localStorage.getItem('nave-edad'));
const htmlOverflow = (page) => page.evaluate(() => getComputedStyle(document.documentElement).overflow);

/** rAF sampler: records the computed display of #edad on every frame from the first one. */
const installGateSampler = () => {
  window.__gateDisplay = new Set();
  window.__gateFrames = 0;
  const tick = () => {
    const gate = document.getElementById('edad');
    if (gate) { window.__gateDisplay.add(getComputedStyle(gate).display); window.__gateFrames++; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

test.describe('S2 age gate: served markup', () => {
  test('S2a the served HTML has #edad without a hidden attribute', async ({ request }) => {
    expectedRed(test, 'E7', 'index.html ships <div id="edad" ... hidden>; app.js un-hides it (U-03)');
    const html = await (await request.get('/index.html')).text();
    const tag = /<[a-z][^>]*\bid="edad"[^>]*>/i.exec(html)?.[0];
    expect(tag, 'the #edad opening tag is in the served HTML').toBeTruthy();
    const attrs = tag.replace(/"[^"]*"|'[^']*'/g, '""');
    expect(attrs, 'no hidden attribute on #edad').not.toMatch(/\shidden(?=[\s=>/])/);
  });
});

test.describe('S2 age gate: first visit', () => {
  test('S2b without stored consent the gate is visible, #edad-si is focused and the page does not scroll', async ({ page }) => {
    await openFresh(page);
    await expect(page.locator('#edad')).toBeVisible();
    await expect(page.locator('#edad-si')).toBeFocused();
    expect(await htmlOverflow(page)).toBe('hidden');
  });

  test('S2b Tab and Shift+Tab stay inside the gate and Escape does not close it', async ({ page }) => {
    expectedRed(test, 'E7', 'no Tab trap: after #edad-no and the region buttons, Tab moves into the page behind the gate (spec 4.2, boot script)');
    await openFresh(page);
    await expect(page.locator('#edad-si')).toBeFocused();
    const outside = [];
    const probe = async (label) => {
      const inside = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#edad'));
      if (!inside) outside.push(`${label}: ${await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}${a.id ? '#' + a.id : ''}.${a.className}` : 'none'; })}`);
    };
    for (let i = 1; i <= 10; i++) { await page.keyboard.press('Tab'); await probe(`Tab ${i}`); }
    for (let i = 1; i <= 10; i++) { await page.keyboard.press('Shift+Tab'); await probe(`Shift+Tab ${i}`); }
    expect(outside, 'focus left the gate').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#edad')).toBeVisible();
  });

  test('S2b header, main and footer are inert while the gate is open (I-05)', async ({ page }) => {
    expectedRed(test, 'E8', 'nothing marks header/main/footer inert while the gate is open (I-05)');
    await openFresh(page);
    await expect(page.locator('#edad')).toBeVisible();
    const inert = await page.evaluate(() => ['header', 'main', 'footer'].map((s) => [s, document.querySelector(s).inert]));
    expect(inert).toEqual([['header', true], ['main', true], ['footer', true]]);
  });

  test('S2c #edad-no shows the minors text and keeps the gate; #edad-si hides it, stores consent, restores scroll and survives a reload', async ({ page }) => {
    await openFresh(page);
    await page.locator('#edad-no').click();
    await expect(page.locator('#edad-msg')).toHaveText(MINORS_PE);
    await expect(page.locator('#edad')).toBeVisible();
    expect(await storedEdad(page)).toBeNull();
    await page.locator('#edad-si').click();
    await expect(page.locator('#edad')).toBeHidden();
    expect(await storedEdad(page)).toBe('si');
    expect(await htmlOverflow(page), 'the page scrolls again').not.toBe('hidden');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#edad')).toBeHidden();
  });

  test('S2c after confirming, inert is gone, focus is on the h1 and nave:edad-ok fires once (I-05)', async ({ page }) => {
    expectedRed(test, 'E8', 'confirming leaves focus on the button behind the hidden gate and fires no nave:edad-ok event (I-05)');
    await page.addInitScript(() => {
      window.__edadOk = 0;
      window.addEventListener('nave:edad-ok', () => { window.__edadOk++; }, true);
    });
    await openFresh(page);
    await page.locator('#edad-si').click();
    await expect(page.locator('#edad')).toBeHidden();
    expect(await page.evaluate(() => window.__edadOk), 'nave:edad-ok events').toBe(1);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'focus lands on the h1').toBe('H1');
    expect(await page.evaluate(() => ['header', 'main', 'footer'].map((s) => document.querySelector(s).inert))).toEqual([false, false, false]);
  });
});

test.describe('S2 age gate: stored consent', () => {
  test('S2d with stored consent #edad never has a display other than none, from the first frame', async ({ page }) => {
    await page.addInitScript(installGateSampler);
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const seen = await page.evaluate(() => ({ displays: [...window.__gateDisplay], frames: window.__gateFrames }));
    expect(seen.frames, 'the sampler saw the gate on several frames').toBeGreaterThan(2);
    expect(seen.displays, 'every sampled display value').toEqual(['none']);
  });

  test('S2d with stored consent and every non-boot script aborted (request-blocked reload) the gate is still never shown', async ({ page }) => {
    await page.addInitScript(installGateSampler);
    await page.route(nonBoot, abort);
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    await page.reload();
    await page.waitForLoadState('load');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const seen = await page.evaluate(() => ({ displays: [...window.__gateDisplay], frames: window.__gateFrames }));
    expect(seen.frames).toBeGreaterThan(2);
    expect(seen.displays).toEqual(['none']);
    await expect(page.locator('#edad')).toBeHidden();
  });
});

test.describe('S2 age gate: depends on no other script', () => {
  test('S2e with js/*, cdnjs/jsdelivr and vendor/* aborted the gate is visible and still dismissable', async ({ page }) => {
    expectedRed(test, 'E7', 'the gate is hidden in the markup and only js/app.js shows and dismisses it: with it aborted the gate never appears (U-03)');
    await page.route(nonBoot, abort);
    await openFresh(page);
    await expect(page.locator('#edad')).toBeVisible();
    await page.locator('#edad-si').click();
    await expect(page.locator('#edad')).toBeHidden();
    expect(await storedEdad(page)).toBe('si');
    expect(await htmlOverflow(page)).not.toBe('hidden');
    await page.reload();
    await expect(page.locator('#edad')).toBeHidden();
  });

  test('S2f localStorage throwing: the gate is shown, confirming hides it for this page view and nothing errors', async ({ page, errors }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('storage blocked', 'SecurityError'); } });
    });
    await openFresh(page);
    await expect(page.locator('#edad')).toBeVisible();
    await page.locator('#edad-si').click();
    await expect(page.locator('#edad')).toBeHidden();
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});

test.describe('S2g short landscape viewports (I-10)', () => {
  for (const viewport of [{ width: 640, height: 360 }, { width: 568, height: 320 }]) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });

      test('S2g .edad-caja scrolls and both buttons can be scrolled into view and clicked', async ({ page }) => {
        expectedRed(test, 'E9', '.edad-caja has no overflow-y:auto: on a short viewport the gate content is clipped (I-10)');
        await openFresh(page);
        await expect(page.locator('#edad')).toBeVisible();
        expect(await page.locator('.edad-caja').evaluate((el) => getComputedStyle(el).overflowY), '.edad-caja computed overflow-y').toMatch(/^(auto|scroll)$/);
        for (const id of ['#edad-no', '#edad-si']) {
          const button = page.locator(id);
          await button.scrollIntoViewIfNeeded();
          const box = await button.boundingBox();
          expect(box.y, `${id} top inside the viewport`).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height, `${id} bottom inside the viewport`).toBeLessThanOrEqual(viewport.height);
        }
        await page.locator('#edad-no').click();
        await expect(page.locator('#edad-msg')).toHaveText(MINORS_PE);
        await page.locator('#edad-si').click();
        await expect(page.locator('#edad')).toBeHidden();
      });
    });
  }
});
