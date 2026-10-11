/**
 * Readiness and settling helpers (spec 4.11, "Readiness").
 *
 * Readiness hook: E7 introduces `html[data-ready]` (exactly once, when the first mode settles) and
 * `html[data-modo]`. Until E7 lands the page only exposes the `con-3d` class (3D mode) or the
 * `.estatica` class on #inicio (static mode, set at runtime). So:
 *   - while the page source contains no "data-ready" hook, we poll `.con-3d` / `#inicio.estatica`
 *     (the documented polling fallback, TODO-E7: it switches itself off the moment E7 adds the hook);
 *   - once the hook exists in the page code, only `html[data-ready]` counts. After E7 `.estatica` is in the
 *     served HTML from the start, so polling it would resolve before the 3D upgrade.
 */
import { codeSources } from '../../static/helpers/source.js';

let hookKnown = null;
/** True once the page code (index.html scripts or js/**) mentions the data-ready hook. */
export function pageHasReadyHook() {
  if (hookKnown === null) hookKnown = codeSources().some((s) => /data-ready|dataset\.ready|setAttribute\(\s*['"]data-ready/.test(s.text));
  return hookKnown;
}

export async function waitReady(page, { timeout = 20_000 } = {}) {
  const hook = pageHasReadyHook();
  await page.waitForFunction(
    (hasHook) => {
      const html = document.documentElement;
      if (html.hasAttribute('data-ready')) return true;
      if (hasHook) return false;
      return html.classList.contains('con-3d') || !!document.querySelector('#inicio.estatica');
    },
    hook,
    { timeout },
  );
}

/** '3d' | 'estatica' | null. Reads html[data-modo] when it exists (E7), otherwise derives it from the classes. */
export async function getModo(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    if (html.dataset.modo) return html.dataset.modo;
    if (html.classList.contains('con-3d')) return '3d';
    if (document.querySelector('#inicio.estatica')) return 'estatica';
    return null;
  });
}

/**
 * Settled state: ready, no active GSAP tween for three consecutive 100 ms polls, then two animation frames.
 * Intro tweens and scrubbed scroll tweens are finite, so this converges; it never waits on the endless
 * render loop. Needed before axe scans and screenshots (E4-07: a scan 2.5 s after load hit a transient state).
 */
export async function waitSettled(page, { timeout = 15_000 } = {}) {
  await waitReady(page, { timeout });
  // GSAP's lag smoothing advances time by only ~33 ms per frame after a stall, so on a slow software-GL runner a
  // 1.5 s intro tween can take a minute of wall time. Turning it off makes GSAP use real elapsed time: the final
  // (settled) state is reached on the next frame. Test-only; it changes no page code.
  await page.evaluate(() => {
    window.__naveCalm = 0;
    if (window.gsap) window.gsap.ticker.lagSmoothing(0);
  });
  await page.waitForFunction(
    () => {
      const g = window.gsap;
      const busy = g ? g.globalTimeline.getChildren(true, true, false).some((t) => t.isActive()) : false;
      window.__naveCalm = busy ? 0 : (window.__naveCalm || 0) + 1;
      return window.__naveCalm >= 3;
    },
    null,
    { timeout, polling: 100 },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
