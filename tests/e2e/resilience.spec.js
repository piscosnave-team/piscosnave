/**
 * @spec-handoff
 * @interface html[data-ready|data-modo|data-motivo] root hooks + static-first layout (spec 4.0, 4.1)
 * @behavior
 *   - S7a-S7d: with the vendored three aborted, scene build throwing, WebGL absent or GSAP aborted the page is static:
 *     3 .ed-texto + .precio, 3 .slot, #lasTres, #ctaPedido visible+operable, [data-ir] links land, motivo sin-modulo|error|sin-webgl|sin-gsap
 *   - S7c: webglcontextlost on #escena in 3D -> within 1 s estatica/contexto-perdido, no pin, catalogue visible
 *   - S7e: JS disabled -> gate visible, noscript :target link confirms it (not remembered), every [data-wa] href is a wa.me default
 *     byte-equal to NAVE_WA(region pe), target _blank, rel noopener noreferrer, [data-ir] hrefs resolve to ids
 *     and the no-JS confirmation survives later fragment navigation (a [data-ir]/anchor click does not bring the gate back)
 *   - S7f: one scroll call per [data-ir] click, no direct click listeners on [data-ir], one delegated document listener, also after rollback
 *   - S7g: reduced motion -> 0 pageerror, 0 console error. S7h: data-ready once + modo 3d, first viewport stable across the upgrade
 *   - S7i: consent + #t-donaire in the URL -> estatica/desplazado, target in view. I-39: data-ready once on both paths; watchdog -> tiempo
 * @edge-cases
 *   - S7h "canvas masked": #escena is hidden and #hCaja (where the WebGL bottles draw) is masked, so the rest of the viewport is compared
 *   - S7b injects the failure through getContext('2d') on non-#escena canvases (canvasTex, after the renderer exists)
 * @see ./age-gate.spec.js
 * @see ./helpers/expected-red.js
 */
import sharp from 'sharp';
import { FIXTURE, ORIGIN } from './helpers/constants.js';
import { expectedRed } from './helpers/expected-red.js';
import { expect, openPage, test, waNumberOf } from './helpers/page.js';
import { runIn } from './helpers/projects.js';
import { waitReady, waitSettled } from './helpers/ready.js';
import { waitScrollIdle } from './helpers/scroll.js';

runIn(test, 'desktop');

const THREE = (url) => url.pathname.includes('/vendor/three/');
const CDN = (url) => /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)$/.test(url.hostname);
const TEXTURE = (url) => url.pathname.includes('/assets/img/tex/');
const abort = (route) => route.abort();
const HOOK_TIMEOUT = 10_000;

/* ---------- shared assertions ---------- */

/** Computed state of everything the order flow needs; returns the list of problems (empty = usable). */
async function catalogueProblems(page) {
  return page.evaluate(() => {
    const problems = [];
    const chain = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
    const check = (label, el) => {
      if (!el) { problems.push(`${label}: missing`); return; }
      const top = el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.display === 'none') problems.push(`${label}: display none`);
      if (cs.visibility !== 'visible') problems.push(`${label}: visibility ${cs.visibility}`);
      if (!(r.width > 0 && r.height > 0)) problems.push(`${label}: empty box ${r.width}x${r.height}`);
      if (chain(el) < 0.99) problems.push(`${label}: opacity chain ${chain(el).toFixed(2)}`);
    };
    document.querySelectorAll('.ed-texto').forEach((el, i) => { check(`.ed-texto[${i}]`, el); check(`.ed-texto[${i}] .precio`, el.querySelector('.precio')); });
    if (document.querySelectorAll('.ed-texto').length !== 3) problems.push('expected 3 .ed-texto');
    document.querySelectorAll('.slot').forEach((el, i) => check(`.slot[${i}]`, el));
    if (document.querySelectorAll('.slot').length !== 3) problems.push('expected 3 .slot');
    check('#lasTres', document.getElementById('lasTres'));
    check('#ctaPedido', document.getElementById('ctaPedido'));
    return problems;
  });
}

/** The static layout is usable: visible, opaque, clickable, and the picker still drives the order link (as S4). */
async function expectCatalogueUsable(page) {
  expect(await catalogueProblems(page), 'catalogue, prices, picker and order CTA must be visible in the static layout').toEqual([]);
  for (const sel of ['#trioArcos .slot[data-ed="Donaire"]', '#trioArcos .slot[data-ed="Sunqu"]', '#trioArcos .slot[data-ed="Nii"]', '#lasTres', '#ctaPedido']) {
    await page.locator(sel).click({ trial: true });
  }
  const sunqu = page.locator('#trioArcos .slot[data-ed="Sunqu"]');
  await sunqu.click();
  await expect(sunqu).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ctaTexto')).toHaveText('Pedir Sunqu por WhatsApp');
  expect(await page.locator('#ctaPedido').getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d*\?text=.*Sunqu/);
  await sunqu.click(); // back to the unselected state
  await expect(page.locator('#ctaTexto')).toHaveText('Pedir por WhatsApp');
}

async function expectStaticHooks(page, motivo, timeout = HOOK_TIMEOUT) {
  const root = page.locator('html');
  await expect(root, 'html[data-ready] is set once the first mode settles (I-39)').toHaveAttribute('data-ready', /.*/, { timeout });
  await expect(root).toHaveAttribute('data-modo', 'estatica', { timeout });
  await expect(root).toHaveAttribute('data-motivo', motivo, { timeout });
}

const inViewport = (page, selector) =>
  page.locator(selector).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });

/** Clicks every [data-ir] link and checks it lands on its static segment (spec 4.0 table, `[data-ir]`). */
async function expectIrLinksLand(page) {
  const count = await page.locator('[data-ir]').count();
  expect(count, 'the page has [data-ir] links').toBeGreaterThanOrEqual(6);
  for (let i = 0; i < count; i++) {
    const link = page.locator('[data-ir]').nth(i);
    const ir = await link.getAttribute('data-ir');
    await page.evaluate((far) => window.scrollTo({ top: far ? 1500 : 0, behavior: 'instant' }), ir === '0');
    await page.evaluate(() => { window.__naveY = null; }); // waitScrollIdle keeps its state on window: reset it so a stale "idle" is not reused
    await link.click();
    // poll instead of waitScrollIdle: a smooth scroll that stalls for 300 ms on a loaded host looks "idle" too early
    if (ir === '0') await expect.poll(() => page.evaluate(() => scrollY), { message: `data-ir=${ir} (#${i}) returns to the top`, timeout: 8_000 }).toBeLessThan(80);
    else if (ir === '1') await expect.poll(() => inViewport(page, '.ed-texto'), { message: `data-ir=${ir} (#${i}) shows the first edition`, timeout: 8_000 }).toBe(true);
    else await expect.poll(() => inViewport(page, '#ctaPedido'), { message: `data-ir=${ir} (#${i}) shows the order widget`, timeout: 8_000 }).toBe(true);
  }
}

const rootAttr = (page, name) => page.evaluate((n) => document.documentElement.getAttribute(n), name);

async function stubNoWebgl(page) {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(String(type))) return null;
      return orig.call(this, type, ...rest);
    };
  });
}

/* ---------- S7a-S7d: the static layout survives every 3D failure (U-01, I-01, I-03) ---------- */

test.describe('S7 static layout survives 3D failures', () => {
  test('S7a the vendored three module is aborted: catalogue, prices, picker, CTA and data-ir links work', async ({ page, errors }) => {
    expectedRed(test, 'E7', 'no .estatica default: with the module gone the 3D layout stays (ed-texto visibility:hidden, empty stage), no hooks (U-01)');
    await page.route(THREE, abort);
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    await expectCatalogueUsable(page);
    await expect(page.locator('.trio-arco svg'), 'the hornacina SVGs are mounted without the module (TC2)').toHaveCount(3);
    await expectIrLinksLand(page);
    expect(errors.consoleErrors.length, `at most the aborted request is logged: ${errors.consoleErrors.join(' | ')}`).toBeLessThanOrEqual(1);
    await expectStaticHooks(page, 'sin-modulo');
  });

  test('S7b the scene build throws after the renderer exists: pin killed, static layout, no empty pinned stage (I-01)', async ({ page }) => {
    expectedRed(test, 'E7', 'the pin is created before the fallible scene build, so a throw leaves a 470% empty pin-spacer and no static layout (I-01)');
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type) === '2d') throw new Error('S7b: injected scene-build failure');
        return orig.call(this, type, ...rest);
      };
    });
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    await expect(page.locator('#inicio')).toHaveClass(/estatica/, { timeout: HOOK_TIMEOUT });
    const pins = await page.evaluate(() => [...document.querySelectorAll('.pin-spacer')].map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(pins.filter((h) => h > innerHeight + 1), 'no pin-spacer taller than the viewport').toEqual([]);
    await expect(page.locator('html')).not.toHaveClass(/con-3d/);
    await expectCatalogueUsable(page);
    await expectStaticHooks(page, 'error');
  });

  test('S7c WebGL is unavailable: static layout, motivo sin-webgl, no uncaught error', async ({ page, errors }) => {
    expectedRed(test, 'E7', 'no data-ready/data-modo/data-motivo hooks, and the static path ends with an uncaught `throw new Error` (I-03, I-39)');
    await stubNoWebgl(page);
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    await expectCatalogueUsable(page);
    expect(errors.pageErrors, 'the static fallback must not be reached by throwing (I-03)').toEqual([]);
    await expectStaticHooks(page, 'sin-webgl');
  });

  test('S7c the WebGL context is lost in 3D: within 1 s static, motivo contexto-perdido, no pin', async ({ page }) => {
    expectedRed(test, 'E7', 'nothing listens to webglcontextlost: the page stays in 3D mode with the pin (I-01)');
    test.setTimeout(120_000);
    await openPage(page);
    await waitSettled(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains('con-3d') || document.documentElement.dataset.modo === '3d'), '3D must be running before the context is lost').toBe(true);
    await page.locator('#escena').dispatchEvent('webglcontextlost');
    await expect(page.locator('html'), 'con-3d removed within 1 s').not.toHaveClass(/con-3d/, { timeout: 1_000 });
    expect(await page.evaluate(() => !!(window.ScrollTrigger && window.ScrollTrigger.getAll().some((s) => s.pin))), 'no pin after the rollback').toBe(false);
    await expectCatalogueUsable(page);
    await expect(page.locator('html')).toHaveAttribute('data-modo', 'estatica', { timeout: 1_000 });
    await expect(page.locator('html')).toHaveAttribute('data-motivo', 'contexto-perdido', { timeout: 1_000 });
  });

  test('S7d the GSAP CDN request is aborted: static layout, motivo sin-gsap, [data-r] text fully opaque', async ({ page, errors }) => {
    expectedRed(test, 'E7', 'no data-ready/data-modo/data-motivo hooks, and the static path ends with an uncaught `throw new Error` (I-03, I-39)');
    await page.route(CDN, abort);
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    await expectCatalogueUsable(page);
    const faded = await page.locator('[data-r]').evaluateAll((els) => els.map((el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; }).filter((o) => o < 0.99));
    expect(faded, '[data-r] text is not left faded without GSAP').toEqual([]);
    expect(errors.pageErrors, 'the static fallback must not be reached by throwing (I-03)').toEqual([]);
    await expectStaticHooks(page, 'sin-gsap');
  });
});

/* ---------- S7e: JavaScript disabled (U-01, I-02, U-03 e2) ---------- */

test.describe('S7e JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('S7e the age gate is visible without JS (no hidden attribute)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#edad')).toBeVisible();
    await expect(page.locator('#edad-si'), 'the JS buttons are hidden without JS').toBeHidden();
  });

  test('S7e the <noscript> :target link confirms the gate for this visit only (e2)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#edad')).toBeVisible();
    await page.getByRole('link', { name: 'Tengo 18 años o más' }).click({ timeout: 3_000 });
    await expect(page.locator('#edad')).toBeHidden();
    await expect(page.locator('.precio').first()).toBeVisible();
    await page.goto('/'); // not remembered: a fresh visit shows the gate again
    await expect(page.locator('#edad')).toBeVisible();
  });

  test('S7e the confirmation survives later fragment navigation: following a [data-ir] or anchor link does not bring the gate back (e2)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Tengo 18 años o más' }).click({ timeout: 3_000 });
    await expect(page.locator('#edad')).toBeHidden();
    await page.locator('header nav a[data-ir="1"]').click();
    await expect(page).toHaveURL(/#t-donaire$/);
    await expect(page.locator('#edad'), 'the gate stays hidden after the next fragment navigation').toBeHidden();
    await page.locator('header nav a[href="#marca"]').click();
    await expect(page).toHaveURL(/#marca$/);
    await expect(page.locator('#edad')).toBeHidden();
  });

  test('S7e the editions, prices, picker and order CTA are visible without JS', async ({ page }) => {
    await page.goto('/');
    expect(await catalogueProblems(page)).toEqual([]);
  });

  test('S7e every order CTA has a real wa.me default href, equal to what NAVE_WA produces for pe with JS on (I-02)', async ({ page, browser }) => {
    await page.goto('/');
    const served = await page.locator('[data-wa]').evaluateAll((els) => els.map((a) => ({ wa: a.getAttribute('data-wa'), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })));
    expect(served.length, 'the page has [data-wa] links').toBeGreaterThanOrEqual(5);
    // explicit javaScriptEnabled: browser.newContext() inherits this describe's test.use({ javaScriptEnabled: false })
    const jsOn = await browser.newContext({ baseURL: ORIGIN, locale: FIXTURE.locale, timezoneId: FIXTURE.timezoneId, reducedMotion: 'reduce', serviceWorkers: 'block', javaScriptEnabled: true });
    try {
      const ref = await jsOn.newPage();
      await ref.addInitScript(() => { try { localStorage.setItem('nave-edad', 'si'); } catch (e) { /* blocked */ } });
      await ref.goto('/?region=pe');
      await ref.waitForLoadState('load');
      const expected = await ref.locator('[data-wa]').evaluateAll((els) => els.map((a) => ({ wa: a.getAttribute('data-wa'), href: a.getAttribute('href') })));
      expect(expected.every((e) => e.href.startsWith('https://wa.me/')), 'the JS-on reference page produced wa.me hrefs').toBe(true);
      expect(served.map(({ wa, href }) => ({ wa, href })), 'no-JS default hrefs, byte for byte').toEqual(expected);
    } finally {
      await jsOn.close();
    }
    for (const a of served) {
      expect(a.href.startsWith('https://wa.me/'), `${a.wa}: ${a.href}`).toBe(true);
      expect(waNumberOf(a.href), `${a.wa}: wa.me number present`).toMatch(/^\d+$/);
      expect(a.target).toBe('_blank');
      expect((a.rel || '').split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    }
  });

  test('S7e every [data-ir] href is a fragment that resolves to an existing id', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.locator('[data-ir]').evaluateAll((els) => els.map((a) => ({ ir: a.getAttribute('data-ir'), href: a.getAttribute('href'), found: /^#[^\s#]+$/.test(a.getAttribute('href') || '') && !!document.getElementById(a.getAttribute('href').slice(1)) })));
    expect(hrefs.filter((h) => !h.found), 'unresolved [data-ir] hrefs').toEqual([]);
    const ones = hrefs.filter((h) => h.ir === '1').map((h) => h.href);
    const orders = hrefs.filter((h) => h.ir === '4.75').map((h) => h.href);
    expect(ones.every((h) => h !== '#inicio'), 'data-ir=1 points at the Donaire edition, not at the top').toBe(true);
    expect(orders.every((h) => h !== '#inicio'), 'data-ir=4.75 points at the collection/order widget, not at the top').toBe(true);
  });
});

test.describe('S7e JavaScript enabled', () => {
  test('S7e with JS on, #edad-pasa in the URL cannot bypass the gate (the noscript CSS does not apply)', async ({ page }) => {
    await page.goto('/?region=pe#edad-pasa');
    await page.waitForLoadState('load');
    await expect(page.locator('#edad')).toBeVisible();
  });
});

/* ---------- S7f: one [data-ir] binding (Sho r1 #6) ---------- */

const installScrollSpy = () => {
  const spy = (window.__naveSpy = { scrolls: 0, direct: 0, doc: [] });
  const intoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...a) { spy.scrolls++; return intoView.apply(this, a); };
  for (const name of ['scrollTo', 'scrollBy']) {
    const orig = window[name];
    window[name] = function (...a) { spy.scrolls++; return orig.apply(this, a); };
  }
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, ...rest) {
    if (type === 'click') {
      if (this instanceof Element && this.hasAttribute('data-ir')) spy.direct++;
      if (this === document) spy.doc.push(String(fn && fn.handleEvent ? fn.handleEvent : fn));
    }
    return add.call(this, type, fn, ...rest);
  };
};

async function expectSingleIrBinding(page) {
  const wiring = await page.evaluate(() => ({ direct: window.__naveSpy.direct, delegated: window.__naveSpy.doc.filter((s) => /data-ir|dataset\.ir|\.ir\b/.test(s)).length }));
  expect(wiring.direct, 'no addEventListener("click") on [data-ir] elements').toBe(0);
  expect(wiring.delegated, 'exactly one delegated click listener on document that handles [data-ir]').toBe(1);
  const count = await page.locator('[data-ir]').count();
  for (let i = 0; i < count; i++) {
    const link = page.locator('[data-ir]').nth(i);
    const ir = await link.getAttribute('data-ir');
    await page.evaluate((far) => window.scrollTo({ top: far ? 1500 : 0, behavior: 'instant' }), ir === '0');
    await page.evaluate(() => { window.__naveSpy.scrolls = 0; window.__naveY = null; }); // reset the spy and waitScrollIdle's saved state
    await link.click();
    await waitScrollIdle(page);
    expect(await page.evaluate(() => window.__naveSpy.scrolls), `scroll calls for one click on [data-ir="${ir}"] (#${i})`).toBe(1);
  }
}

test.describe('S7f [data-ir] is bound once', () => {
  test('S7f static fallback (module aborted): one scroll call per click, one delegated listener, none on the links', async ({ page }) => {
    expectedRed(test, 'E7', 'module aborted: [data-ir] has no handler at all (0 scroll calls) and the links are the #inicio placeholder (spec 4.0)');
    await page.addInitScript(installScrollSpy);
    await page.route(THREE, abort);
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    await expectSingleIrBinding(page);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('S7f static layout reached by reduced motion: still one binding', async ({ page }) => {
      expectedRed(test, 'E7', 'estatica() binds a click listener on every [data-ir] element instead of one delegated listener (Sho r1 #6)');
      await page.addInitScript(installScrollSpy);
      await openPage(page, { wait: false });
      await page.waitForLoadState('load');
      await expectSingleIrBinding(page);
    });
  });

  test('S7f after a 3D -> static rollback (context lost): still one binding', async ({ page }) => {
    expectedRed(test, 'E7', 'there is no rollback on webglcontextlost, and [data-ir] has a direct listener in 3D mode (Sho r1 #6, I-01)');
    test.setTimeout(120_000);
    await page.addInitScript(installScrollSpy);
    await openPage(page);
    await waitSettled(page);
    await page.locator('#escena').dispatchEvent('webglcontextlost');
    await expect(page.locator('html')).toHaveAttribute('data-modo', 'estatica', { timeout: 3_000 });
    await expectSingleIrBinding(page);
  });
});

/* ---------- S7g: no throw as control flow (I-03) ---------- */

test.describe('S7g static visit', () => {
  test.use({ reducedMotion: 'reduce' });

  test('S7g a reduced-motion (static) visit logs no uncaught error and no console error', async ({ page, errors }) => {
    expectedRed(test, 'E7', 'js/escena.js ends the static path with `throw new Error("Versión estática")`: an uncaught pageerror (I-03)');
    await openPage(page, { wait: false });
    await page.waitForLoadState('load');
    expect(errors.pageErrors, 'uncaught errors').toEqual([]);
    expect(errors.consoleErrors, 'console errors').toEqual([]);
  });
});

/* ---------- S7h, I-39: readiness and first-viewport stability ---------- */

const watchReady = () => {
  window.__ready = [];
  new MutationObserver(() => window.__ready.push(document.documentElement.getAttribute('data-ready'))).observe(document, { attributes: true, attributeFilter: ['data-ready'], subtree: true });
};

/** Share of pixels that differ by more than the YIQ threshold (pixelmatch metric, no anti-alias pass). */
async function diffRatio(a, b, threshold = 0.2) {
  const [ia, ib] = await Promise.all([a, b].map((png) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) return 1;
  const maxDelta = 35215 * threshold * threshold;
  const px = (d, o) => { const al = d[o + 3] / 255; return [255 + (d[o] - 255) * al, 255 + (d[o + 1] - 255) * al, 255 + (d[o + 2] - 255) * al]; };
  let differing = 0;
  const total = ia.info.width * ia.info.height;
  for (let i = 0; i < total; i++) {
    const [r1, g1, b1] = px(ia.data, i * 4), [r2, g2, b2] = px(ib.data, i * 4);
    const y = (0.29889531 * (r1 - r2)) + (0.58662247 * (g1 - g2)) + (0.11448223 * (b1 - b2));
    const iq = (0.59597799 * (r1 - r2)) - (0.2741761 * (g1 - g2)) - (0.32180189 * (b1 - b2));
    const q = (0.21147017 * (r1 - r2)) - (0.52261711 * (g1 - g2)) + (0.31114694 * (b1 - b2));
    if (0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q > maxDelta) differing++;
  }
  return differing / total;
}

test.describe('S7h / I-39 readiness', () => {
  test('S7h in 3D data-ready appears exactly once with data-modo=3d (no data-motivo)', async ({ page }) => {
    expectedRed(test, 'E7', 'the page exposes no html[data-ready]/data-modo hooks (I-39)');
    test.setTimeout(120_000);
    await page.addInitScript(watchReady);
    await openPage(page);
    await waitSettled(page);
    const root = page.locator('html');
    await expect(root, 'html[data-ready] present once 3D has settled').toHaveAttribute('data-ready', /.*/, { timeout: 3_000 });
    await expect(root).toHaveAttribute('data-modo', '3d');
    expect(await rootAttr(page, 'data-motivo'), 'no data-motivo in 3D mode').toBeNull();
    expect((await page.evaluate(() => window.__ready)).length, 'data-ready set exactly once, never removed or re-set').toBe(1);
  });

  test.describe('static path', () => {
    test.use({ reducedMotion: 'reduce' });

    test('I-39 on the static path (reduced motion) data-ready appears exactly once with data-modo=estatica, motivo=reduce', async ({ page }) => {
      expectedRed(test, 'E7', 'the page exposes no html[data-ready]/data-modo/data-motivo hooks (I-39)');
      await page.addInitScript(watchReady);
      await openPage(page);
      await expectStaticHooks(page, 'reduce', 3_000);
      await page.waitForTimeout(500); // a second "ready" would have shown up by now
      expect((await page.evaluate(() => window.__ready)).length, 'data-ready set exactly once').toBe(1);
    });
  });

  test('I-39 watchdog: a stalled texture request ends in estatica/tiempo (about 8 s) and the late upgrade is discarded', async ({ page }) => {
    expectedRed(test, 'E7', 'there is no watchdog and no data-ready hook: a stalled texture leaves the page blocked in 3D (I-39, spec 4.0)');
    test.setTimeout(90_000);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(TEXTURE, async (route) => { await gate; await route.continue(); });
    await page.addInitScript(watchReady);
    await page.addInitScript(() => { try { localStorage.setItem('nave-edad', 'si'); } catch (e) { /* blocked */ } });
    // not openPage(): in-flight textures delay window `load`, so the navigation must not wait for it
    await page.goto('/?region=pe', { waitUntil: 'commit' });
    await expectStaticHooks(page, 'tiempo', 30_000);
    release(); // the textures finally arrive: the late completion must not flip the mode
    await page.waitForTimeout(2_000);
    await expect(page.locator('html')).toHaveAttribute('data-modo', 'estatica');
    expect((await page.evaluate(() => window.__ready)).length, 'data-ready still set exactly once').toBe(1);
    expect((await rootAttr(page, 'class')) ?? '').not.toMatch(/con-3d/);
  });

  test('S7i consent + an edition id in the URL: the page stays estatica/desplazado and the anchor target is in view', async ({ page }) => {
    expectedRed(test, 'E7', 'the module always pins (no scroll guard), so a deep link opens the 3D stage with the edition hidden (U-01, spec 4.0)');
    test.setTimeout(120_000);
    await page.addInitScript(() => { try { localStorage.setItem('nave-edad', 'si'); } catch (e) { /* blocked */ } });
    await page.goto('/?region=pe#t-donaire');
    await page.waitForLoadState('load');
    await waitReady(page);
    expect(await inViewport(page, '#t-donaire'), '#t-donaire is in view').toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('t-donaire')).visibility), 'the edition is visible, not a hidden pinned child').toBe('visible');
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-modo', 'estatica', { timeout: HOOK_TIMEOUT });
    await expect(root).toHaveAttribute('data-motivo', 'desplazado');
  });

  test('S7h the first viewport (.presencia) looks the same before and after the 3D upgrade (canvas area masked)', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(THREE, async (route) => { await gate; await route.continue(); });
    await page.addInitScript(() => { try { localStorage.setItem('nave-edad', 'si'); } catch (e) { /* blocked */ } });
    await page.goto('/?region=pe', { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.NAVE_REGION && !!document.getElementById('hCaja'));
    await page.addStyleTag({ content: '#escena{visibility:hidden!important}' });
    const shot = () => page.screenshot({ mask: [page.locator('#hCaja')], maskColor: '#ff00ff', animations: 'disabled', caret: 'hide' });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const before = await shot(); // the module is held: this is the pre-upgrade (static default) first viewport
    release();
    await waitSettled(page);
    const after = await shot();
    await testInfo.attach('presencia-before-upgrade', { body: before, contentType: 'image/png' });
    await testInfo.attach('presencia-after-upgrade', { body: after, contentType: 'image/png' });
    const ratio = await diffRatio(before, after);
    expect(ratio, 'share of differing pixels in the first viewport, before vs after the 3D upgrade (h1 tolerance 0.002)').toBeLessThanOrEqual(0.002);
  });
});
