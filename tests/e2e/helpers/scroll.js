/**
 * Scroll helpers. In 3D mode the hero, editions and trio live inside one pinned stage driven by
 * scroll position, so controls such as the .slot buttons are only operable at the end of the pin
 * (E4-09). In static mode there is no pin and plain scrolling works. These helpers hide the difference.
 */
import { waitSettled } from './ready.js';

/** { start, end } of the pinned ScrollTrigger, or null (static mode / GSAP missing). */
export async function pinRange(page) {
  return page.evaluate(() => {
    const pin = window.ScrollTrigger && window.ScrollTrigger.getAll().find((s) => s.pin);
    return pin ? { start: pin.start, end: pin.end } : null;
  });
}

const frames = (page, n = 2) =>
  page.evaluate((count) => new Promise((resolve) => { let i = 0; const tick = () => (++i >= count ? resolve() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);

export async function scrollToY(page, y) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await frames(page);
  await waitSettled(page);
}

/** Waits until window.scrollY stops changing (smooth scrolls started by data-ir links). */
export async function waitScrollIdle(page, { stableMs = 300, timeout = 8_000 } = {}) {
  await page.waitForFunction(
    (need) => {
      const now = performance.now();
      const y = Math.round(window.scrollY);
      if (window.__naveY !== y) { window.__naveY = y; window.__naveYSince = now; return false; }
      return now - window.__naveYSince >= need;
    },
    stableMs,
    { timeout, polling: 50 },
  );
}

/** Moves to where the edition picker, #lasTres and #ctaPedido are operable, in either mode. */
export async function scrollToOrderWidget(page) {
  const pin = await pinRange(page);
  if (pin) {
    await scrollToY(page, pin.end - 50);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('trioArcos')).visibility === 'visible');
  } else {
    await page.locator('#trioArcos').scrollIntoViewIfNeeded();
    await frames(page);
    await waitSettled(page);
  }
}

/**
 * Scrolls an element to the CENTER of the viewport and waits for the scene to settle (used before axe scans, I-42).
 * Centering matters: the [data-r] reveal fades text in over the first ~28% and out over the last ~28% of its scroll
 * range, so an element parked at the viewport edge is mid-fade and axe reports a transient color-contrast failure.
 */
export async function scrollIntoViewSettled(page, selector) {
  await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await frames(page);
  await waitSettled(page);
}
