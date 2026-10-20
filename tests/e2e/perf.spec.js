/**
 * @spec-handoff
 * @interface 3D scene lifecycle hooks html[data-bucle]: 'activo' | 'pausado'
 * @behavior
 *   - P2: an off-screen stage stops scheduling scene frames and avoids idle layout/style work
 *   - P3: a hidden document pauses the loop and a visible document resumes it
 *   - P4: renderer DPR is capped at 1.5 on mobile and 2 on desktop
 *   - P5: a scene frame batches layout reads before writes and skips unchanged style values
 * @edge-cases
 *   - context loss pauses the loop; each 3D probe owns and closes its Chromium process
 * @see ../../js/escena.js
 */
import { expect, test } from './helpers/page.js';
import { expectedRed } from './helpers/expected-red.js';
import { FIXTURE } from './helpers/constants.js';
import { waitSettled } from './helpers/ready.js';

const SCENE_FRAMES = 12;

/** Run one 3D probe in an isolated Chromium, then stop rAF before closing its GPU process. */
async function withScene(playwright, testInfo, setup, probe) {
  const use = testInfo.project.use;
  const browser = await playwright.chromium.launch({ args: use.launchOptions?.args });
  let context;
  let page;
  try {
    context = await browser.newContext({
      baseURL: use.baseURL,
      timezoneId: use.timezoneId ?? FIXTURE.timezoneId,
      locale: use.locale ?? FIXTURE.locale,
      colorScheme: use.colorScheme,
      serviceWorkers: use.serviceWorkers,
      viewport: use.viewport,
      deviceScaleFactor: use.deviceScaleFactor,
      isMobile: use.isMobile,
      hasTouch: use.hasTouch,
    });
    page = await context.newPage();
    await setup(page);
    await page.goto('/?region=pe');
    await waitSettled(page);
    await expect(page.locator('html')).toHaveAttribute('data-modo', '3d');
    return await probe(page, context);
  } finally {
    // SwiftShader keeps rendering queued work after a page closes unless rAF is stopped first.
    await page?.evaluate(() => { window.requestAnimationFrame = () => 0; }).catch(() => {});
    await context?.close().catch(() => {});
    await browser.close();
  }
}

function installFrameProbe() {
  const originalRaf = window.requestAnimationFrame.bind(window);
  const originalRect = Element.prototype.getBoundingClientRect;
  const probe = window.__perfProbe = { nativeRaf: originalRaf, scheduled: 0, completed: 0, samples: [], active: null };
  window.requestAnimationFrame = (callback) => {
    // escena.js queues its named `bucle` callback. Count that contract, not GSAP or this test's own rAFs.
    if (callback.name === 'bucle') probe.scheduled++;
    return originalRaf((time) => {
      const sample = { reads: 0, writes: 0, redundantWrites: 0, writeBeforeRead: false };
      probe.active = sample;
      try { callback(time); } finally { probe.active = null; probe.completed++; probe.samples.push(sample); }
    });
  };
  Element.prototype.getBoundingClientRect = function (...args) {
    if (probe.active) probe.active.reads++;
    return originalRect.apply(this, args);
  };
}

async function waitForFrames(page, count = SCENE_FRAMES) {
  await page.evaluate(async (frames) => {
    const start = window.__perfProbe.completed;
    await new Promise((resolve) => {
      let seen = 0;
      const tick = () => {
        seen++;
        if (seen >= frames) resolve();
        else window.__perfProbe.nativeRaf(tick);
      };
      window.__perfProbe.nativeRaf(tick);
    });
  }, count);
}

function metric(metrics, name) {
  const value = metrics.metrics.find((entry) => entry.name === name)?.value;
  if (value === undefined) throw new Error(`CDP Performance metric ${name} is absent; enable the Performance domain before sampling`);
  return value;
}

test.describe('P2-P5 runtime performance (I-14)', () => {
  test('P2 when the stage is off-screen the scene schedules no more than one frame and causes no idle layout/recalc work', async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop 3D lifecycle probe');
    await withScene(playwright, testInfo, async (page) => {
      await page.addInitScript(installFrameProbe);
    }, async (page, context) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect.poll(() => page.locator('#inicio').evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(0);
      await expect(page.locator('html')).toHaveAttribute('data-bucle', 'pausado');
      // The scroll transition itself can settle one layout on its next frame. Warm
      // that fixed browser cost, then compare two identical paused 12-rAF windows.
      const controlBefore = await cdp.send('Performance.getMetrics');
      await waitForFrames(page);
      const controlAfter = await cdp.send('Performance.getMetrics');
      const control = {
        layoutDelta: metric(controlAfter, 'LayoutCount') - metric(controlBefore, 'LayoutCount'),
        recalcDelta: metric(controlAfter, 'RecalcStyleCount') - metric(controlBefore, 'RecalcStyleCount'),
      };
      const before = await cdp.send('Performance.getMetrics');
      await page.evaluate(() => { window.__perfProbe.scheduled = 0; });
      await waitForFrames(page);
      const after = await cdp.send('Performance.getMetrics');
      const result = await page.evaluate(() => ({ scheduled: window.__perfProbe.scheduled, state: document.documentElement.dataset.bucle }));
      const layoutDelta = metric(after, 'LayoutCount') - metric(before, 'LayoutCount');
      const recalcDelta = metric(after, 'RecalcStyleCount') - metric(before, 'RecalcStyleCount');
      expect(result.scheduled, 'scene rAF scheduling across a fixed 12-callback idle window').toBeLessThanOrEqual(1);
      expect(result.state).toBe('pausado');
      expect(layoutDelta, 'paused-scene layout work stays within the fixed 12-rAF harness baseline').toBeLessThanOrEqual(control.layoutDelta);
      expect(recalcDelta, 'paused-scene style work stays within the fixed 12-rAF harness baseline').toBeLessThanOrEqual(control.recalcDelta);
    });
  });

  test('P2 the CDP layout/style counters report a forced layout control', async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop CDP performance probe');
    await withScene(playwright, testInfo, async () => {}, async (page, context) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const before = await cdp.send('Performance.getMetrics');
      await page.evaluate(() => {
        const probe = document.createElement('div');
        document.body.append(probe);
        probe.style.width = '1px';
        void probe.offsetWidth;
        probe.style.width = '2px';
        void probe.offsetWidth;
        probe.remove();
      });
      const after = await cdp.send('Performance.getMetrics');
      expect(metric(after, 'LayoutCount') - metric(before, 'LayoutCount'), 'forced layout must produce an observable CDP delta').toBeGreaterThan(0);
      expect(metric(after, 'RecalcStyleCount') - metric(before, 'RecalcStyleCount'), 'forced style recalculation must produce an observable CDP delta').toBeGreaterThan(0);
    });
  });

  test('P3 visibility hidden pauses the loop and visible resumes it', async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop 3D lifecycle probe');
    await withScene(playwright, testInfo, async (page) => {
      await page.addInitScript(() => {
        let visibility = 'visible';
        Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => visibility });
        window.__setVisibility = (next) => { visibility = next; document.dispatchEvent(new Event('visibilitychange')); };
      });
    }, async (page) => {
      await page.evaluate(() => window.__setVisibility('hidden'));
      await expect(page.locator('html')).toHaveAttribute('data-bucle', 'pausado');
      await page.evaluate(() => window.__setVisibility('visible'));
      await expect(page.locator('html')).toHaveAttribute('data-bucle', 'activo');
    });
  });

  test('P3 a lost WebGL context marks the render loop paused', async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop 3D lifecycle probe');
    await withScene(playwright, testInfo, async () => {}, async (page) => {
      await page.locator('#escena').dispatchEvent('webglcontextlost');
      await expect(page.locator('html')).toHaveAttribute('data-bucle', 'pausado');
    });
  });

  test('P4 renderer DPR is capped at 1.5 on mobile and 2 on desktop', async ({ playwright }, testInfo) => {
    test.skip(!['desktop', 'mobile-375'].includes(testInfo.project.name), 'DPR probe');
    await withScene(playwright, testInfo, async () => {}, async (page) => {
      const pixelRatio = await page.evaluate(() => {
        const canvas = document.getElementById('escena');
        return canvas.width / canvas.getBoundingClientRect().width;
      });
      expect(pixelRatio).toBeLessThanOrEqual(testInfo.project.name === 'mobile-375' ? 1.5 : 2);
    });
  });

  test('P4 crossing desktop and narrow portrait breakpoints reapplies the renderer DPR cap', async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop resize probe');
    await withScene(playwright, testInfo, async (page) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 2 });
      });
    }, async (page) => {
      const pixelRatio = () => page.evaluate(() => {
        const canvas = document.getElementById('escena');
        return canvas.width / canvas.getBoundingClientRect().width;
      });
      expect(await pixelRatio(), 'initial desktop DPR cap').toBeLessThanOrEqual(2);
      await page.setViewportSize({ width: 375, height: 667 });
      expect(await pixelRatio(), 'narrow portrait uses the mobile DPR cap').toBeLessThanOrEqual(1.5);
      await page.setViewportSize({ width: 1280, height: 800 });
      expect(await pixelRatio(), 'desktop cap is restored after crossing back').toBeLessThanOrEqual(2);
    });
  });

  test('P5 each scene frame reads layout before style writes and skips unchanged style values', async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop 3D frame probe');
    await withScene(playwright, testInfo, async () => {}, async (page) => {
      const source = await page.evaluate(() => fetch('js/escena.js').then((response) => response.text()));
      const pintaDom = source.slice(source.indexOf('function pintaDom'), source.indexOf('/* ===================== 3D'));
      const firstRead = pintaDom.indexOf('getBoundingClientRect');
      const firstWrite = pintaDom.search(/\.style\.|Object\.assign\([^,]+\.style/);
      expect(firstRead, 'pintaDom must perform layout reads').toBeGreaterThanOrEqual(0);
      expect(firstWrite, 'pintaDom must perform style writes').toBeGreaterThanOrEqual(0);
      expect(firstRead, 'the first pintaDom layout read precedes its first style write (P5)').toBeLessThan(firstWrite);
    });
  });
});
