/**
 * @spec-handoff
 * @interface order widget on landscape phones (spec 4.4 L1-L3, plan decision D18 f1): under (max-height:500px) and (orientation:landscape) the page uses the static (.estatica) layout
 * @behavior
 *   - L1: at 844x390, 740x360, 667x375 and 568x320 (landscape project: isMobile, DPR 2) html has data-modo=estatica and data-motivo=apaisado, no pageerror
 *   - L1: scrolled to the end of the order widget (end of the pin in 3D, #ctaPedido centred when static) #lasTres, #ctaPedido and #ctaNota are fully inside the viewport (bottom <= innerHeight, top below the fixed header), fully opaque, elementFromPoint at the centre of #lasTres/#ctaPedido returns the element, and a real pointer click at the centre of #ctaPedido opens the wa.me chat
 *   - L2: start in 3D at 375x667 (mobile-375), setViewportSize(667x375): the page rolls back to estatica/apaisado with no pageerror, no pin/con-3d is left, the order widget fits; rotating back to 375x667 keeps the static layout until a reload
 *   - L3 (control, green today): portrait 375x667 keeps the 3D layout (no data-motivo) and its order widget fits at the end of the pin; the pixel baseline for portrait is tests/visual (untouched)
 * @edge-cases
 *   - the mode is asserted separately from the geometry (soft) so a wrong mode and a clipped CTA are both reported; geometry is mode-agnostic (3D: end of the pin, static: scrollIntoView centre)
 *   - every test runs in its own Chromium, closed in finally with the render loop stopped (S7h/E8 harness hygiene); no timeout is raised
 *   - 568x320 is the smallest landscape phone (iPhone SE 1st gen) and the same size as the age-gate case S2g
 * @see ./a11y.spec.js
 * @see ./helpers/scroll.js
 */
import { expectedRed } from './helpers/expected-red.js';
import { expect, openPage, test as base } from './helpers/page.js';
import { runIn } from './helpers/projects.js';
import { getModo, waitSettled } from './helpers/ready.js';
import { pinRange, scrollToY } from './helpers/scroll.js';

/**
 * Own browser per test, closed in `finally` with the render loop stopped. Every test here may start a 3D page (today the landscape
 * project still gets the 3D layout), and the shared worker browser keeps its GPU process draining the SwiftShader backlog of a
 * long-lived 3D page after the test ends, starving the next 3D test in the same worker (S7h finding).
 */
const test = base.extend({
  page: async ({ playwright, launchOptions, baseURL, timezoneId, locale, colorScheme, serviceWorkers, viewport, deviceScaleFactor, isMobile, hasTouch, reducedMotion, javaScriptEnabled }, use) => {
    const own = await playwright.chromium.launch({ args: launchOptions?.args });
    const context = await own.newContext({ baseURL, timezoneId, locale, colorScheme, serviceWorkers, viewport, deviceScaleFactor, isMobile, hasTouch, reducedMotion, javaScriptEnabled });
    const page = await context.newPage();
    try {
      await use(page);
    } finally {
      await Promise.race([page.evaluate(() => { window.requestAnimationFrame = () => 0; }).catch(() => {}), new Promise((r) => setTimeout(r, 3_000))]);
      await context.close().catch(() => {});
      await own.close().catch(() => {});
    }
  },
});

/** Landscape phones (spec 4.4 L1). */
const SIZES = [
  { width: 844, height: 390, red: '#lasTres/#ctaPedido/#ctaNota bottoms 449/453/487 px' },
  { width: 740, height: 360, red: '#lasTres/#ctaPedido/#ctaNota bottoms 432/436/471 px' },
  { width: 667, height: 375, red: '#lasTres/#ctaPedido/#ctaNota bottoms 438/442/476 px' },
  { width: 568, height: 320, red: '#lasTres/#ctaPedido/#ctaNota bottoms 419/423/457 px' },
];

const frames = (page, n = 4) =>
  page.evaluate((count) => new Promise((resolve) => { let i = 0; const t0 = performance.now(); const tick = () => (++i >= count && performance.now() - t0 >= 250 ? resolve() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);

const modeOf = (page) => page.evaluate(() => ({ modo: document.documentElement.dataset.modo ?? null, motivo: document.documentElement.dataset.motivo ?? null }));

/** Brings the order widget to its operable position in either mode: the end of the pinned stage (3D) or #ctaPedido centred (static). */
async function goToOrderWidget(page) {
  const pin = await pinRange(page);
  if (pin) await scrollToY(page, pin.end - 50);
  else await page.locator('#ctaPedido').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await frames(page);
}

/** In-page: geometry, opacity and hit-test facts of the three order-widget elements. Runs in the browser. */
function orderWidgetFacts() {
  const chain = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const header = document.querySelector('.cabecera').getBoundingClientRect().bottom;
  const boxes = {};
  for (const id of ['lasTres', 'ctaPedido', 'ctaNota']) {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = cx >= 0 && cx <= innerWidth && cy >= 0 && cy <= innerHeight ? document.elementFromPoint(cx, cy) : null;
    boxes[id] = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), empty: !(r.width > 0 && r.height > 0), opacity: chain(el), hit: !!hit && (hit === el || el.contains(hit)), hitBy: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}` : 'nothing (centre outside the viewport)', pointerEvents: getComputedStyle(el).pointerEvents };
  }
  return { header: Math.round(header), vh: innerHeight, vw: innerWidth, boxes };
}

/** Problems of the order widget against the L1 contract (empty = contract holds). */
async function orderWidgetProblems(page) {
  const f = await page.evaluate(orderWidgetFacts);
  const problems = [];
  for (const [id, b] of Object.entries(f.boxes)) {
    if (b.empty) { problems.push(`#${id}: empty box`); continue; }
    if (b.bottom > f.vh) problems.push(`#${id}: bottom ${b.bottom} is below the viewport bottom ${f.vh}`);
    if (b.top < f.header) problems.push(`#${id}: top ${b.top} is under the fixed header (bottom ${f.header})`);
    if (b.left < 0 || b.right > f.vw) problems.push(`#${id}: horizontally outside the viewport (${b.left}..${b.right} of ${f.vw})`);
    if (b.opacity < 0.99) problems.push(`#${id}: not fully shown (opacity chain ${b.opacity.toFixed(2)})`);
    if (id !== 'ctaNota') {
      if (b.pointerEvents === 'none') problems.push(`#${id}: pointer-events none`);
      if (!b.hit) problems.push(`#${id}: elementFromPoint at its centre hits ${b.hitBy}`);
    }
  }
  return problems;
}

/**
 * A real pointer click at the centre of #ctaPedido opens the wa.me chat in a new tab (served locally, nothing leaves the machine).
 * Raw coordinates on purpose: Playwright's locator.click() calls scrollIntoView, which also scrolls overflow:hidden ancestors
 * (the 3D stage) and so reaches controls a visitor never can (measured: the clipped CTA at 844x390 was "clickable" that way).
 */
async function clickOrderCta(page) {
  await page.context().route(/^https:\/\/wa\.me\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa</title>' }));
  const popupPromise = page.context().waitForEvent('page', { timeout: 5_000 });
  popupPromise.catch(() => {}); // a click that never lands must fail on the missing popup, not as an unhandled rejection
  const box = await page.locator('#ctaPedido').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const popup = await popupPromise;
  try {
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url(), 'the order CTA opens the wa.me chat').toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  } finally {
    await popup.close();
  }
}

/* =============================== L1 =============================== */

test.describe('L1 the order CTA is reachable on landscape phones (U-06, f1)', () => {
  runIn(test, 'landscape');

  for (const viewport of SIZES) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test(`L1 ${viewport.width}x${viewport.height}: static layout (apaisado) and #lasTres, #ctaPedido, #ctaNota fully inside the viewport, hit-testable and clickable`, async ({ page, errors }) => {
        expectedRed(test, 'E9', `landscape phones still get the 3D layout (data-modo=3d, no data-motivo=apaisado) and at the end of the pin ${viewport.red} are below the viewport bottom ${viewport.height}, clipped by the stage (U-06)`);
        await openPage(page);
        await waitSettled(page);
        const state = await modeOf(page);
        expect.soft(state, 'landscape phones under (max-height:500px) use the static layout (f1)').toEqual({ modo: 'estatica', motivo: 'apaisado' });
        await goToOrderWidget(page);
        const problems = await orderWidgetProblems(page);
        expect.soft(problems, `order widget at ${viewport.width}x${viewport.height} (mode ${state.modo})`).toEqual([]);
        if (problems.length === 0) await clickOrderCta(page); // only a widget that is on screen can be clicked: no extra noise on a clipped one
        expect(errors.pageErrors, 'no uncaught exception').toEqual([]);
      });
    });
  }
});

/* =============================== L2 =============================== */

test.describe('L2 a 3D page rolls back to the static layout when the phone is rotated to landscape (U-06)', () => {
  runIn(test, 'mobile-375');

  test('L2 375x667 in 3D, then 667x375: rolls back to estatica/apaisado (no pin left, no pageerror) and stays static after rotating back', async ({ page, errors }) => {
    expectedRed(test, 'E9', 'rotating a 3D page to 667x375 leaves it in 3D (data-modo stays 3d, no rollback to estatica/apaisado) because nothing listens to the height media query (U-06)');
    await openPage(page);
    await waitSettled(page);
    expect(await getModo(page), '3D mode is required at the start (SwiftShader); portrait is the starting point of the rotation').toBe('3d');
    expect((await modeOf(page)).motivo, 'no static reason in 3D').toBeNull();

    await page.setViewportSize({ width: 667, height: 375 });
    // the rollback is driven by the media-query change, which fires in the next rendered frame: poll, no fixed delay
    await expect.poll(() => modeOf(page), { message: 'after rotating to 667x375 the page rolls back (same rollback as context loss)' }).toEqual({ modo: 'estatica', motivo: 'apaisado' });
    await frames(page);
    const left = await page.evaluate(() => ({
      inicioStatic: document.getElementById('inicio').classList.contains('estatica'),
      con3d: document.querySelector('.con-3d') !== null,
      pinSpacers: document.querySelectorAll('.pin-spacer').length,
    }));
    expect(left, 'the 3D upgrade is fully undone (static class back, no con-3d, no pin spacer)').toEqual({ inicioStatic: true, con3d: false, pinSpacers: 0 });
    expect(await pinRange(page), 'ScrollTrigger pin is gone').toBeNull();
    await goToOrderWidget(page);
    expect(await orderWidgetProblems(page), 'the order widget fits after the rollback').toEqual([]);
    expect(errors.pageErrors, 'the rollback throws nothing').toEqual([]);

    await page.setViewportSize({ width: 375, height: 667 });
    await frames(page);
    expect(await modeOf(page), 'rotating back keeps the static layout until a reload (documented)').toEqual({ modo: 'estatica', motivo: 'apaisado' });
    expect(errors.pageErrors, 'rotating back throws nothing').toEqual([]);
  });
});

/* =============================== L3 =============================== */

test.describe('L3 portrait is unchanged (U-06 non-regression)', () => {
  runIn(test, 'mobile-375');

  test('L3 portrait 375x667 keeps the 3D layout (not apaisado) and the order widget fits at the end of the pin', async ({ page, errors }) => {
    await openPage(page);
    await waitSettled(page);
    expect(await modeOf(page), 'portrait stays in 3D').toEqual({ modo: '3d', motivo: null });
    expect(await pinRange(page), 'the pinned stage exists in portrait').not.toBeNull();
    await goToOrderWidget(page);
    expect(await orderWidgetProblems(page), 'the order widget fits in portrait 3D').toEqual([]);
    expect(errors.pageErrors, 'no uncaught exception').toEqual([]);
  });
});
