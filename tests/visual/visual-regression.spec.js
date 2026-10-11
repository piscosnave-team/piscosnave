/**
 * @spec-handoff
 * @interface visual regression of the page against baselines captured from the PRE-refactor page (commit a20e3de)
 * @behavior
 *   - static layout (prefers-reduced-motion) at desktop 1280x800 and mobile 375x667 @2x: hero, trio, trio with Sunqu picked, story, footer
 *   - settled 3D page at desktop and mobile 375: hero, an edition mid-pin, the order widget, the order widget with Sunqu picked
 *   - strict, local-only (spec decision h1): maxDiffPixelRatio 0.002, threshold 0.2 (playwright.config.js), CSS animations disabled
 *   - the WebGL canvas is hidden while shooting (it is non-deterministic: Math.random particles, clock-driven sway); the DOM over it is compared;
 *     the render loop is frozen per capture; the scroll hint is masked in the 3D shots, the hero fallback photo in the 3D hero shot only
 *   - the baselines are GREEN on the unmodified a20e3de page and must stay green after the E5 move/extraction (behaviour-preserving proof)
 * @edge-cases
 *   - not part of `npm test` and never run in CI (fonts differ between machines): `npm run test:visual`
 *   - baselines were generated in mcr.microsoft.com/playwright:v1.63.0-noble (Linux); regenerate there, never on another OS
 *   - update on purpose only: `npm run test:visual -- --update-snapshots`, then review every changed image
 * @see ../../playwright.config.js
 * @see ../e2e/helpers/scroll.js
 */
import { expect, openPage, test } from '../e2e/helpers/page.js';
import { waitSettled } from '../e2e/helpers/ready.js';
import { pinRange, scrollToY } from '../e2e/helpers/scroll.js';

// The canvas is a full-viewport fixed layer, so a Playwright mask would paint over the whole page: hide it instead.
const HIDE_CANVAS = '#escena{visibility:hidden !important}';

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const MOBILE = { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const MOBILE_3D = { ...MOBILE, deviceScaleFactor: 1 }; // software GL at 2x is ~4x slower and the layout does not depend on density

/**
 * Init script for the 3D specs: caps requestAnimationFrame at ~12 fps. The canvas is hidden in every shot, so what the
 * software-GL loop draws is irrelevant, but at full rate it starves the main thread and screenshots time out on a
 * loaded host. GSAP and the scene are time-based, so the settled DOM state is the same, only reached in coarser steps.
 */
const throttleFrames = () => {
  const real = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  let queue = [];
  let nextId = 1_000_000_000; // far from native ids, so a cancel can never hit the wrong thing
  let last = 0;
  let armed = false;
  const pump = (t) => {
    const now = performance.now();
    if (now - last < (window.__rafGap || 80)) return real(pump);
    last = now;
    armed = false;
    const run = queue;
    queue = []; // callbacks registered while running land in the next batch, as with the native API
    for (const entry of run) if (!entry.cancelled) entry.cb(t);
  };
  window.requestAnimationFrame = (cb) => {
    const entry = { id: nextId++, cb, cancelled: false };
    queue.push(entry);
    if (!armed) { armed = true; real(pump); }
    return entry.id;
  };
  window.cancelAnimationFrame = (id) => {
    const hit = queue.find((e) => e.id === id);
    if (hit) hit.cancelled = true;
    else if (id < 1_000_000_000) realCancel(id);
  };
};

/** Freezes every requestAnimationFrame callback for the capture itself: the DOM is already settled, so nothing may move. */
const idleLoop = (page) => page.evaluate(() => new Promise((r) => { window.__rafGap = 1e9; setTimeout(r, 300); }));
const wakeLoop = (page) => page.evaluate(() => { window.__rafGap = 80; });

/** Page-coordinate rectangle covering all the given selectors (for a screenshot clip). */
async function regionOf(page, selectors) {
  return page.evaluate((sels) => {
    const boxes = sels.map((s) => document.querySelector(s).getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left)) + scrollX;
    const top = Math.min(...boxes.map((b) => b.top)) + scrollY;
    const right = Math.max(...boxes.map((b) => b.right)) + scrollX;
    const bottom = Math.max(...boxes.map((b) => b.bottom)) + scrollY;
    return { x: Math.max(0, Math.floor(left)), y: Math.max(0, Math.floor(top)), width: Math.ceil(right - left), height: Math.ceil(bottom - top) };
  }, selectors);
}

const staticSuite = (label, env) => {
  test.describe(`static layout, ${label}`, () => {
    test.use({ ...env, reducedMotion: 'reduce' });

    test.beforeEach(async ({ page }) => {
      await openPage(page);
      await waitSettled(page);
      await expect(page.locator('#inicio')).toHaveClass(/estatica/);
    });

    test(`hero (${label})`, async ({ page }) => {
      await expect(page).toHaveScreenshot(`static-${label}-hero.png`);
    });

    test(`trio (${label})`, async ({ page }) => {
      const clip = await regionOf(page, ['#trioCabeza', '#trioPie']);
      await expect(page).toHaveScreenshot(`static-${label}-trio.png`, { fullPage: true, clip });
    });

    test(`trio with Sunqu picked (${label})`, async ({ page }) => {
      await page.locator('#trioArcos .slot[data-ed="Sunqu"]').click();
      await expect(page.locator('#ctaTexto')).toHaveText('Pedir Sunqu por WhatsApp');
      const clip = await regionOf(page, ['#trioCabeza', '#trioPie']);
      await expect(page).toHaveScreenshot(`static-${label}-trio-sunqu.png`, { fullPage: true, clip });
    });

    test(`story and footer (${label})`, async ({ page }) => {
      await expect(page.locator('#marca')).toHaveScreenshot(`static-${label}-marca.png`);
      await expect(page.locator('footer.pie')).toHaveScreenshot(`static-${label}-footer.png`);
    });
  });
};

staticSuite('desktop', DESKTOP);
staticSuite('mobile', MOBILE);

const settled3dSuite = (label, env) => {
  test.describe(`settled 3D page, ${label}`, () => {
    test.use({ ...env, reducedMotion: 'no-preference' });

    test(`3D stage: hero, mid-pin edition, order widget, Sunqu picked (${label})`, async ({ page }) => {
      test.setTimeout(600_000);
      await page.addInitScript(throttleFrames);
      await openPage(page);
      await waitSettled(page);
      const pin = await pinRange(page);
      expect(pin, 'the 3D pin exists (WebGL must be available, SwiftShader args)').not.toBeNull();
      const at = (progress) => Math.round(pin.start + ((pin.end - pin.start) * progress) / 5);
      // the render loop keeps the software-GL main thread busy: each capture needs far more than the default 5 s
      const shoot = { style: HIDE_CANVAS, mask: [page.locator('.desliza')], timeout: 120_000 };
      const heroShoot = { ...shoot, mask: [...shoot.mask, page.locator('.h-respaldo')] };
      // masked: .desliza everywhere (endless scroll-hint tween); .h-respaldo in the hero shot only (the ghosted fallback photo
      // is re-filtered by Chromium while the 3D intro transform settles, so it differs run to run; it is compared pixel-for-pixel
      // in the static suite, and later shots need it visible because it sits under the trio)

      await idleLoop(page);
      await expect.soft(page).toHaveScreenshot(`3d-${label}-hero.png`, heroShoot);
      await wakeLoop(page);

      await scrollToY(page, at(2.5));
      await idleLoop(page);
      await expect.soft(page).toHaveScreenshot(`3d-${label}-edition.png`, shoot);
      await wakeLoop(page);

      await scrollToY(page, pin.end - 50);
      await page.waitForFunction(() => getComputedStyle(document.getElementById('trioArcos')).visibility === 'visible');
      await waitSettled(page);
      await idleLoop(page);
      await expect.soft(page).toHaveScreenshot(`3d-${label}-order.png`, shoot);
      await wakeLoop(page);

      await page.locator('#trioArcos .slot[data-ed="Sunqu"]').click();
      await expect(page.locator('#ctaTexto')).toHaveText('Pedir Sunqu por WhatsApp');
      await waitSettled(page);
      await idleLoop(page);
      await expect.soft(page).toHaveScreenshot(`3d-${label}-order-sunqu.png`, shoot);
    });
  });
};

settled3dSuite('desktop', DESKTOP);
settled3dSuite('mobile', MOBILE_3D);
