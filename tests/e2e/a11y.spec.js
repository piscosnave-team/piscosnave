/**
 * @spec-handoff
 * @interface keyboard + screen-reader reachability of the page (spec 4.3 K1-K6, S8; 4.2 gate focus): skip links, stage controls, gate, legal toggles
 * @behavior
 *   - K1: in 3D at P=0,0.5,1.5,2.5,3.5,4.75 every a/button in .etapa has visibility:visible, no display:none, is in the a11y tree; off-segment ones have pointer-events:none, on-segment ones are hit-testable
 *   - K2: Tab reaches hero CTAs, the 3 order links, 3 slots, #lasTres, #ctaPedido in DOM order; each stop (and el.focus()) scrolls its segment into view (opacity chain >= 0.99, inside viewport, elementFromPoint hits it) after 4 rendered frames
 *   - K3: Enter on the Sunqu slot then on #ctaPedido behaves like S4 (CTA text/href, wa.me in a new tab). K4: first two Tab stops are `Saltar al contenido` (-> main[tabindex=-1]) and `Ir al pedido` (-> order widget), hidden until focused, EU: `Skip to content`/`Go to order`
 *   - I-05: while #edad is open header/main/footer are inert and Tab cycles inside it; confirming lands focus on the h1 (tabindex -1), inert gone, stage scrollable
 *   - I-06: each [data-abre] keeps its own aria-expanded in sync (opening one resets the other); with JS off both legal panels can be opened and their text read
 *   - I-09: static path scrolls with behavior 'auto' under reduced motion (and still 'smooth' without it). S8: settled axe (wcag2a/2aa/22aa), serious/critical outside tests/a11y-baseline.json fail
 * @edge-cases
 *   - the 3D tests run in desktop only (software GL); every 3D test uses its own browser, closed in finally with the render loop stopped (S7h hygiene)
 *   - the K2/K1 segment windows follow spec 4.3 (hero P=0, edition k P=k+1.5, trio P=4.75); skip-link target for `Ir al pedido` is any element in #inicio holding #ctaPedido or #trioArcos
 * @see ./age-gate.spec.js
 * @see ./helpers/axe.js
 */
import AxeBuilder from '@axe-core/playwright';
import { AXE_TAGS, loadBaseline, newViolations, scanEach, scanPage, scanSections } from './helpers/axe.js';
import { expectedRed } from './helpers/expected-red.js';
import { expect, openPage, test as base } from './helpers/page.js';
import { runIn } from './helpers/projects.js';
import { getModo, waitSettled } from './helpers/ready.js';
import { pinRange, scrollToY } from './helpers/scroll.js';

/**
 * Own browser per test, closed in `finally` with the render loop stopped. The shared worker browser keeps its GPU process draining the
 * SwiftShader backlog of a long-lived 3D page after the test ends and starves the next 3D test in the same worker (S7h finding).
 * Static contexts (reduced motion, JS off) have no GL load and use the worker browser.
 */
const test = base.extend({
  page: async ({ playwright, browser, launchOptions, baseURL, timezoneId, locale, colorScheme, serviceWorkers, viewport, deviceScaleFactor, isMobile, hasTouch, reducedMotion, javaScriptEnabled }, use) => {
    const heavy = reducedMotion !== 'reduce' && javaScriptEnabled !== false;
    const own = heavy ? await playwright.chromium.launch({ args: launchOptions?.args }) : null;
    const context = await (own ?? browser).newContext({ baseURL, timezoneId, locale, colorScheme, serviceWorkers, viewport, deviceScaleFactor, isMobile, hasTouch, reducedMotion, javaScriptEnabled });
    const page = await context.newPage();
    try {
      await use(page);
    } finally {
      if (heavy) await Promise.race([page.evaluate(() => { window.requestAnimationFrame = () => 0; }).catch(() => {}), new Promise((r) => setTimeout(r, 3_000))]);
      await context.close().catch(() => {});
      if (own) await own.close().catch(() => {});
    }
  },
});

/* ---------- shared bits ---------- */

/** Spec 4.3 stage positions (P = scroll progress of the pinned stage, 0..5). */
const POSITIONS = [0, 0.5, 1.5, 2.5, 3.5, 4.75];
/** Which controls are the active segment at each position; at 0.5 the hero has faded out and the first edition has not entered yet. */
const ACTIVE_AT = { 0: ['hero'], 0.5: [], 1.5: ['ed0'], 2.5: ['ed1'], 3.5: ['ed2'], 4.75: ['trio'] };
/** Controls the keyboard walk must reach, in the order spec 4.3 K2 lists them. */
const KEYS = {
  'hero-elegir': '.h-texto .acciones a[data-ir="4.75"]',
  'hero-descubrir': '.h-texto .acciones a[data-ir="1"]',
  'ed0-pedir': '.ed-texto [data-wa="Donaire"]',
  'ed1-pedir': '.ed-texto [data-wa="Sunqu"]',
  'ed2-pedir': '.ed-texto [data-wa="Nii"]',
  'slot-donaire': '.slot[data-ed="Donaire"]',
  'slot-sunqu': '.slot[data-ed="Sunqu"]',
  'slot-nii': '.slot[data-ed="Nii"]',
  lasTres: '#lasTres',
  ctaPedido: '#ctaPedido',
};
const KEY_ORDER = Object.keys(KEYS);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Page in 3D mode (S1 guarantees SwiftShader WebGL); returns the pinned range. */
async function open3d(page, opts) {
  await openPage(page, opts);
  await waitSettled(page);
  expect(await getModo(page), '3D mode is required (SwiftShader); a silent fallback to the static layout would hide the U-05 defect').toBe('3d');
  const pin = await pinRange(page);
  expect(pin, 'the pinned stage exists in 3D mode').not.toBeNull();
  return pin;
}
const scrollToP = (page, pin, p) => scrollToY(page, pin.start + ((pin.end - pin.start) * p) / 5);
const progress = (page, pin) => page.evaluate(({ start, end }) => ((scrollY - start) / (end - start)) * 5, pin);

/** In-page: raw computed facts about every a/button in .etapa, plus whether each segment is fully shown. Runs in the browser. */
function snapshotStage() {
  const chain = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const noDisplay = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).display === 'none') return true; return false; };
  const articles = [...document.querySelectorAll('.ed-texto')];
  const groupOf = (el) => {
    if (el.closest('.h-texto')) return 'hero';
    const art = el.closest('.ed-texto');
    if (art) return `ed${articles.indexOf(art)}`;
    if (el.closest('#trioArcos, #trioPie')) return 'trio';
    return 'other';
  };
  const controls = [...document.querySelectorAll('.etapa a, .etapa button')].map((el) => {
    const r = el.getBoundingClientRect();
    // `needle` is the control's first text run (case-insensitive substring match in getByRole): the browser's computed name joins
    // block-level children with spaces ("Donaire S/ 50"), textContent does not ("DonaireS/ 50")
    const firstText = (() => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('svg') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) }); return w.nextNode()?.nodeValue.replace(/\s+/g, ' ').trim() ?? ''; })();
    const name = el.getAttribute('aria-label') || firstText;
    const inView = r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    const hit = inView ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return {
      group: groupOf(el),
      role: el.tagName === 'A' ? 'link' : 'button',
      name,
      visibility: getComputedStyle(el).visibility,
      displayNone: noDisplay(el),
      pointerEvents: getComputedStyle(el).pointerEvents,
      chain: chain(el),
      inView,
      hittable: !!hit && (hit === el || el.contains(hit)),
      hitBy: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}${hit.className && typeof hit.className === 'string' ? `.${hit.className.split(' ')[0]}` : ''}` : 'nothing',
    };
  });
  const shown = {
    hero: chain(document.querySelector('.h-texto')) >= 0.99,
    ...Object.fromEntries(articles.map((a, i) => [`ed${i}`, [...a.children].every((c) => chain(c) >= 0.99)])),
    trio: [...document.getElementById('trioCabeza').children, ...document.getElementById('trioPie').children, ...document.querySelectorAll('.slot .etiqueta')].every((c) => chain(c) >= 0.99),
  };
  return { controls, shown };
}

/** In-page: what the focused element is and whether its segment is on screen. Runs in the browser. */
function focusFacts(keys) {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { label: '(nothing focused)', key: null, group: null, problems: ['nothing has focus'] };
  const chain = (n0) => { let o = 1; for (let n = n0; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const articles = [...document.querySelectorAll('.ed-texto')];
  const art = el.closest('.ed-texto');
  const group = el.closest('.h-texto') ? 'hero' : art ? `ed${articles.indexOf(art)}` : el.closest('#trioArcos, #trioPie') ? 'trio' : el.closest('header') ? 'header' : el.closest('footer') ? 'footer' : 'other';
  const key = Object.entries(keys).find(([, sel]) => el.matches(sel))?.[0] ?? null;
  const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.dataset.ed ? `[${el.dataset.ed}]` : ''} "${(el.getAttribute('aria-label') || el.textContent).replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
  const problems = [];
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (cs.visibility !== 'visible') problems.push(`visibility ${cs.visibility}`);
  if (chain(el) < 0.99) problems.push(`opacity chain ${chain(el).toFixed(2)}`);
  if (!(r.width > 0 && r.height > 0)) problems.push('empty box');
  else if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) problems.push(`box outside the viewport (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)} of ${innerHeight})`);
  else {
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!(hit && (hit === el || el.contains(hit)))) problems.push(`elementFromPoint at its centre hits ${hit ? hit.tagName.toLowerCase() + (hit.id ? `#${hit.id}` : '') : 'nothing'}`);
  }
  if (group === 'hero' && !(chain(document.querySelector('.h-texto')) >= 0.99)) problems.push('hero text not fully shown');
  if (/^ed\d$/.test(group) && !([...art.children].every((c) => chain(c) >= 0.99))) problems.push(`${group} text not fully shown`);
  if (group === 'trio' && !([...document.getElementById('trioCabeza').children, ...document.getElementById('trioPie').children, ...document.querySelectorAll('.slot .etiqueta')].every((c) => chain(c) >= 0.99))) problems.push('trio not fully shown');
  return { label, key, group, problems };
}

const STAGE_GROUPS = ['hero', 'ed0', 'ed1', 'ed2', 'trio'];

/**
 * The focused control's segment must be on screen (spec 4.3 K2 says "within 1 s"). A wall-clock bound is load-dependent: under SwiftShader a
 * frame of the 3D page takes 0.45-0.85 s (measured) and the DOM is only rewritten inside a frame; after the frame that applies the new
 * scroll position, .boton's 160 ms transform transition needs two more frames to land (#ctaPedido sat 40 px low for 3 frames). So the wait
 * is counted in rendered frames (4, and at least 250 ms) instead of seconds. Returns the facts of the focused element (problems [] = on screen).
 */
async function onScreenAfterFrames(page) {
  const before = await page.evaluate(focusFacts, KEYS);
  if (!STAGE_GROUPS.includes(before.group)) return before; // not a stage control: nothing to scroll
  await page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    let n = 0;
    const tick = () => (++n >= 4 && performance.now() - t0 >= 250 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }));
  return page.evaluate(focusFacts, KEYS);
}

/**
 * Presses Tab until the focused element matches `selector`. Gives up (found:false) at the first lap's end: once focus reaches the footer or
 * wraps around to the document. A second lap does not count: native focus scrolling to the footer parks the pin at its end, where the
 * order widget happens to be on screen, which would hide the defect.
 */
async function tabTo(page, selector, max = 30) {
  const trail = [];
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const facts = await page.evaluate(focusFacts, KEYS);
    trail.push(facts.label);
    if (await page.evaluate((s) => !!document.activeElement && document.activeElement.matches(s), selector)) return { found: true, trail };
    if (facts.group === 'footer' || facts.label === '(nothing focused)') break;
  }
  return { found: false, trail };
}

const describeFound = (found) => found.map((v) => `${v.rule} (${v.impact}) ${v.target}`);

/* =============================== K1 =============================== */

test.describe('K1 stage controls stay reachable at every scroll position (U-05)', () => {
  runIn(test, 'desktop');

  /** Two halves per check so each test (one 3D page load plus three scroll positions) stays well inside the 60 s timeout under software GL. */
  const HALVES = [[0, 0.5, 1.5], [2.5, 3.5, 4.75]];

  for (const positions of HALVES) {
    const at = `P = ${positions.join(', ')}`;

    test(`K1 every a/button in .etapa is visible (not visibility:hidden, not display:none) and in the accessibility tree at ${at}`, async ({ page }) => {
      const pin = await open3d(page);
      const problems = [];
      for (const p of positions) {
        await scrollToP(page, pin, p);
        const { controls } = await page.evaluate(snapshotStage);
        expect(controls.length, 'the stage has its controls (2 hero links, 3 order links, 3 slots, #lasTres, #ctaPedido)').toBeGreaterThanOrEqual(10);
        const wanted = new Map();
        for (const c of controls) {
          if (c.visibility !== 'visible') problems.push(`P=${p} ${c.role} "${c.name}": visibility ${c.visibility}`);
          if (c.displayNone) problems.push(`P=${p} ${c.role} "${c.name}": display none`);
          wanted.set(`${c.role}|${c.name}`, (wanted.get(`${c.role}|${c.name}`) ?? 0) + 1);
        }
        for (const [id, expected] of wanted) {
          const [role, name] = id.split('|');
          const found = await page.locator('.etapa').getByRole(role, { name }).count();
          if (found < expected) problems.push(`P=${p} ${role} "${name}": missing from the accessibility tree (getByRole found ${found} of ${expected})`);
        }
      }
      expect(problems, 'hidden or unexposed controls').toEqual([]);
    });

    test(`K1 off-segment controls have pointer-events:none and the active segment is hit-testable at ${at}`, async ({ page }) => {
      const pin = await open3d(page);
      const problems = [];
      for (const p of positions) {
        await scrollToP(page, pin, p);
        const { controls } = await page.evaluate(snapshotStage);
        const active = ACTIVE_AT[p];
        for (const c of controls) {
          const label = `P=${p} ${c.role} "${c.name}" (${c.group})`;
          if (active.includes(c.group)) {
            if (c.pointerEvents === 'none') problems.push(`${label}: active segment but pointer-events none`);
            if (!c.inView) problems.push(`${label}: active segment but not inside the viewport`);
            else if (!c.hittable) problems.push(`${label}: elementFromPoint at its centre hits ${c.hitBy}`);
          } else if (c.pointerEvents !== 'none') {
            problems.push(`${label}: off-segment but pointer-events ${c.pointerEvents}`);
          }
        }
      }
      expect(problems, 'pointer-events gating').toEqual([]);
    });
  }
});

/* =============================== K2, K3, K4 =============================== */

test.describe('K2/K3/K4 keyboard walk in 3D mode (U-05, I-08)', () => {
  runIn(test, 'desktop');

  test('K2 Tab from the top reaches the hero CTAs, the three order links, the three slots, #lasTres and #ctaPedido in order, each on screen right after the focus', async ({ page }) => {
    const pin = await open3d(page);
    const trail = [];
    const first = new Map();
    const problems = [];
    let headerStops = 0;
    let lastStage = null;
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const now = await page.evaluate(focusFacts, KEYS);
      // wait for the rendered frames only when the stop enters a new segment (the scroll happens there); stops within it are already settled
      const facts = STAGE_GROUPS.includes(now.group) && now.group !== lastStage ? await onScreenAfterFrames(page) : now;
      if (STAGE_GROUPS.includes(now.group)) lastStage = now.group;
      trail.push(facts.label);
      if (facts.group === 'header') headerStops += 1;
      if (facts.key) {
        if (!first.has(facts.key)) first.set(facts.key, i);
        if (facts.problems.length) problems.push(`${facts.key}: ${facts.problems.join('; ')}`);
        if (headerStops === 0) problems.push(`${facts.key} was reached before any header control`);
      }
      if (facts.key === 'ctaPedido' || facts.group === 'footer' || facts.label === '(nothing focused)') break; // first lap only (see tabTo)
    }
    const missing = KEY_ORDER.filter((k) => !first.has(k));
    expect(missing, `controls never reached by Tab. Trail: ${trail.join(' > ')}`).toEqual([]);
    const indices = KEY_ORDER.map((k) => first.get(k));
    expect(indices, `reached in spec order. Trail: ${trail.join(' > ')}`).toEqual([...indices].sort((a, b) => a - b));
    expect(problems, 'segments not on screen after the focus').toEqual([]);
    const at = await progress(page, pin);
    expect(at, 'the walk ends at the order widget (P about 4.75)').toBeGreaterThan(4.6);
  });

  test('K2 focusing a control with focus() scrolls its segment into view, in any direction', async ({ page }) => {
    await open3d(page);
    const problems = [];
    for (const key of ['ed2-pedir', 'hero-descubrir', 'slot-sunqu', 'ed0-pedir', 'ctaPedido']) {
      await page.evaluate((sel) => document.querySelector(sel).focus(), KEYS[key]);
      const facts = await onScreenAfterFrames(page);
      if (facts.key !== key) problems.push(`${key}: did not take focus (focused: ${facts.label})`);
      else if (facts.problems.length) problems.push(`${key}: ${facts.problems.join('; ')}`);
    }
    expect(problems, 'focus() did not bring the segment on screen').toEqual([]);
  });

  test('K3 Enter on the Sunqu slot picks it, Enter on #ctaPedido opens the wa.me chat with the edition (keyboard order path)', async ({ page }) => {
    await open3d(page);
    const toSlot = await tabTo(page, '.slot[data-ed="Sunqu"]');
    expect(toSlot.found, `the Sunqu slot is reached by Tab. Trail: ${toSlot.trail.join(' > ')}`).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#ctaTexto')).toHaveText('Pedir Sunqu por WhatsApp');
    await expect(page.locator('.slot[data-ed="Sunqu"]')).toHaveAttribute('aria-pressed', 'true');
    const toCta = await tabTo(page, '#ctaPedido');
    expect(toCta.found, `#ctaPedido is reached by Tab. Trail: ${toCta.trail.join(' > ')}`).toBe(true);
    await page.context().route(/^https:\/\/wa\.me\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa</title>' }));
    const [popup] = await Promise.all([page.context().waitForEvent('page'), page.keyboard.press('Enter')]);
    try {
      await popup.waitForLoadState('domcontentloaded');
      expect(popup.url()).toMatch(/^https:\/\/wa\.me\/\d+\?text=.*Sunqu/);
    } finally {
      await popup.close();
    }
  });

  test('K4 the first two Tab stops are the skip links (`Saltar al contenido` -> main, `Ir al pedido` -> the order widget), hidden until focused (I-08)', async ({ page }) => {
    await open3d(page);
    const skip = page.getByRole('link', { name: 'Saltar al contenido', exact: true });
    const order = page.getByRole('link', { name: 'Ir al pedido', exact: true });
    expect(await skip.count(), 'a `Saltar al contenido` link exists').toBe(1);
    expect(await order.count(), 'an `Ir al pedido` link exists').toBe(1);
    const small = async (loc) => { const b = await loc.boundingBox(); return !b || (b.width <= 2 && b.height <= 2); };
    expect(await small(skip), '`Saltar al contenido` is visually hidden until focused (.sr)').toBe(true);
    expect(await small(order), '`Ir al pedido` is visually hidden until focused (.sr)').toBe(true);

    const visibleWhenFocused = async (loc, label) => {
      const facts = await loc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, hit: !!hit && (hit === el || el.contains(hit)), vw: innerWidth, vh: innerHeight };
      });
      expect(facts.w, `${label} width when focused`).toBeGreaterThanOrEqual(40);
      expect(facts.h, `${label} height when focused`).toBeGreaterThanOrEqual(16);
      expect(facts.top, `${label} top inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(facts.bottom, `${label} bottom inside the viewport`).toBeLessThanOrEqual(facts.vh);
      expect(facts.hit, `${label} is not covered by the fixed header`).toBe(true);
    };
    await page.keyboard.press('Tab');
    await expect(skip, 'first Tab stop').toBeFocused();
    await visibleWhenFocused(skip, '`Saltar al contenido`');
    await page.keyboard.press('Tab');
    await expect(order, 'second Tab stop').toBeFocused();
    await visibleWhenFocused(order, '`Ir al pedido`');

    const targets = await page.evaluate(() => {
      const target = (text) => { const a = [...document.querySelectorAll('a')].find((x) => x.textContent.trim() === text); const id = (a.getAttribute('href') || '').slice(1); return id ? document.getElementById(id) : null; };
      const main = document.querySelector('main'), ctaPedido = document.getElementById('ctaPedido'), trioArcos = document.getElementById('trioArcos'), inicio = document.getElementById('inicio');
      const skipTarget = target('Saltar al contenido'), orderTarget = target('Ir al pedido');
      return {
        skipIsMain: skipTarget === main,
        mainTabindex: main.getAttribute('tabindex'),
        orderIsWidget: !!orderTarget && orderTarget !== inicio && inicio.contains(orderTarget) && (orderTarget.contains(ctaPedido) || orderTarget.contains(trioArcos)),
      };
    });
    expect(targets.skipIsMain, '`Saltar al contenido` points at <main>').toBe(true);
    expect(targets.mainTabindex, '<main> is programmatically focusable').toBe('-1');
    expect(targets.orderIsWidget, '`Ir al pedido` points at the order widget (inside #inicio, holding #trioArcos or #ctaPedido)').toBe(true);

    // activating them: the first moves focus to <main>; the second leaves the order widget on screen and reachable
    await order.focus();
    await page.keyboard.press('Enter');
    const inWidget = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#trioArcos, #trioPie'));
    if (!(await inWidget())) await page.keyboard.press('Tab');
    expect(await inWidget(), '`Ir al pedido` then at most one Tab lands inside the order widget').toBe(true);
    const shown = await onScreenAfterFrames(page);
    expect(shown.problems, `the order widget is on screen after \`Ir al pedido\` (${shown.label})`).toEqual([]);
    await skip.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName), '`Saltar al contenido` moves focus to <main>').toBe('MAIN');
  });
});

test.describe('K4 skip links in the EU region (I-08)', () => {
  runIn(test, 'reduced-motion');

  test('K4 the first two Tab stops are `Skip to content` and `Go to order` with ?region=eu', async ({ page }) => {
    await openPage(page, { region: 'eu' });
    const label = () => page.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent).trim());
    await page.keyboard.press('Tab');
    expect(await label(), 'first Tab stop').toBe('Skip to content');
    await page.keyboard.press('Tab');
    expect(await label(), 'second Tab stop').toBe('Go to order');
  });
});

/* =============================== I-05 age gate focus =============================== */

/** Fresh visit, no stored consent; does not wait for the 3D/static readiness (the gate must not depend on it). */
async function openFresh(page) {
  await openPage(page, { consent: false, wait: false });
  await page.waitForLoadState('domcontentloaded');
}
const stops = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}` : 'none'; });

test.describe('I-05 age gate keyboard focus (static layout)', () => {
  runIn(test, 'reduced-motion');

  test('I-05 while #edad is open header, main and footer are inert (out of the accessibility tree) and the dialog is not', async ({ page }) => {
    await openFresh(page);
    await expect(page.locator('#edad')).toBeVisible();
    expect(await page.evaluate(() => ['header', 'main', 'footer', '#edad'].map((s) => [s, document.querySelector(s).inert])), 'inert flags').toEqual([['header', true], ['main', true], ['footer', true], ['#edad', false]]);
    // Playwright's role engine ignores `inert`, Chromium's own accessibility tree does not: ask it (CDP)
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const exposed = async () => (await cdp.send('Accessibility.getFullAXTree')).nodes.filter((n) => !n.ignored).map((n) => n.role && n.role.value);
    const behind = (await exposed()).filter((r) => ['main', 'banner', 'contentinfo', 'navigation', 'link', 'heading'].includes(r));
    expect(behind, 'page landmarks, links and headings in the accessibility tree while the gate is open').toEqual([]);
    expect(await exposed(), 'the dialog stays exposed').toContain('dialog');
  });

  test('I-05 Tab and Shift+Tab cycle through every gate button and never leave the dialog', async ({ page }) => {
    await openFresh(page);
    await expect(page.locator('#edad-si')).toBeFocused();
    const buttons = await page.evaluate(() => [...document.querySelectorAll('#edad button')].filter((b) => b.offsetParent !== null).map((b) => b.id || b.dataset.region));
    expect(buttons.length, 'the gate has several buttons (confirm, minors, two regions)').toBeGreaterThanOrEqual(3);
    const visited = [];
    for (let i = 0; i < buttons.length; i += 1) {
      await page.keyboard.press('Tab');
      visited.push(await page.evaluate(() => { const a = document.activeElement; return a.closest('#edad') ? a.id || a.dataset.region : `OUTSIDE ${a.tagName}`; }));
    }
    expect(visited.filter((v) => v.startsWith('OUTSIDE')), 'focus escaped the dialog').toEqual([]);
    expect(await stops(page), 'a full Tab cycle returns to the first control').toBe('button#edad-si');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.closest('#edad') !== null), 'Shift+Tab from the first control wraps inside the dialog').toBe(true);
    expect(await stops(page), 'Shift+Tab from the first control lands on the last one').not.toBe('button#edad-si');
  });

  test('I-05 confirming moves focus to the h1 (tabindex -1), lifts inert and the next Tab continues at the hero CTA', async ({ page }) => {
    await openFresh(page);
    await page.locator('#edad-si').click();
    await expect(page.locator('#edad')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'focus lands on the h1').toBe('H1');
    expect(await page.evaluate(() => document.activeElement.getAttribute('tabindex')), 'the h1 is focusable programmatically only').toBe('-1');
    expect(await page.evaluate(() => ['header', 'main', 'footer'].map((s) => document.querySelector(s).inert)), 'inert is lifted').toEqual([false, false, false]);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.matches('.h-texto .acciones a[data-ir="4.75"]')), 'the next Tab continues after the h1 (reading order)').toBe(true);
  });
});

test.describe('I-05 age gate in 3D mode', () => {
  runIn(test, 'desktop');

  test('I-05 in 3D, confirming lands focus on the h1 without scrolling and leaves the pinned stage scrollable', async ({ page }) => {
    await openPage(page, { consent: false }); // waits for data-ready: the scene settles behind the open gate
    await expect(page.locator('#edad')).toBeVisible();
    await page.locator('#edad-si').click();
    await expect(page.locator('#edad')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'focus lands on the h1').toBe('H1');
    // ScrollTrigger.refresh() (run on nave:edad-ok) re-parents the pinned stage and blurs anything focused inside it: the h1 must keep focus after it
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'the h1 keeps focus after the refresh and the next frames').toBe('H1');
    expect(await page.evaluate(() => scrollY), 'moving focus to the h1 does not scroll').toBe(0);
    const pin = await pinRange(page);
    expect(pin, 'the pinned stage survived the gate').not.toBeNull();
    expect(pin.end - pin.start, 'ScrollTrigger measured the full pin after the gate closed (nave:edad-ok refresh)').toBeGreaterThan(3 * (await page.evaluate(() => innerHeight)));
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { message: 'the page scrolls again after confirming' }).toBe(400);
  });
});

/* =============================== I-06 legal toggles =============================== */

const LEGAL = ['aviso', 'privacidad'];

test.describe('I-06 legal toggles (JS on)', () => {
  runIn(test, 'reduced-motion');

  test('I-06 opening one legal panel sets its own aria-expanded and resets the other; closing clears it; Enter works from the keyboard', async ({ page }) => {
    await openPage(page);
    const state = () => page.evaluate((ids) => ids.map((id) => ({ id, open: document.getElementById(id).open, expanded: document.querySelector(`[data-abre="${id}"]`).getAttribute('aria-expanded') })), LEGAL);
    const toggle = (id) => page.locator(`[data-abre="${id}"]`);
    expect(await state(), 'initially both closed').toEqual([{ id: 'aviso', open: false, expanded: 'false' }, { id: 'privacidad', open: false, expanded: 'false' }]);
    await toggle('aviso').click();
    expect(await state(), 'aviso opened').toEqual([{ id: 'aviso', open: true, expanded: 'true' }, { id: 'privacidad', open: false, expanded: 'false' }]);
    await toggle('privacidad').click();
    expect(await state(), 'privacidad opened, aviso reset').toEqual([{ id: 'aviso', open: false, expanded: 'false' }, { id: 'privacidad', open: true, expanded: 'true' }]);
    await toggle('privacidad').click();
    expect(await state(), 'privacidad closed').toEqual([{ id: 'aviso', open: false, expanded: 'false' }, { id: 'privacidad', open: false, expanded: 'false' }]);
    await toggle('aviso').focus();
    await page.keyboard.press('Enter');
    expect(await state(), 'Enter on the focused toggle opens it').toEqual([{ id: 'aviso', open: true, expanded: 'true' }, { id: 'privacidad', open: false, expanded: 'false' }]);
  });
});

test.describe('I-06 legal text without JavaScript', () => {
  runIn(test, 'reduced-motion');
  test.use({ javaScriptEnabled: false });

  for (const id of LEGAL) {
    test(`I-06 with JS off the ${id} panel can be opened and its text read`, async ({ page }) => {
      await page.goto('/?region=pe');
      await page.locator('.edad a[href="#edad-pasa"]').click(); // the no-JS age confirmation (E7)
      await expect(page.locator('#edad')).toBeHidden();
      const summary = page.locator(`#${id} > summary`);
      if (await summary.isVisible()) await summary.click();
      else await page.locator(`a[data-abre="${id}"]`).click();
      await expect(page.locator(`#${id} .texto-legal p`).first(), `${id} legal text is visible after using the visible control`).toBeVisible();
    });
  }
});

/* =============================== I-09 reduced-motion scroll =============================== */

/** Records every scrollIntoView call (receiver id + options) before page scripts run. */
const spyScrollIntoView = () => {
  window.__scrolls = [];
  const orig = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (arg) { window.__scrolls.push({ id: this.id, behavior: arg && typeof arg === 'object' ? arg.behavior : undefined }); return orig.call(this, arg); };
};

test.describe('I-09 static-path scrolling honours reduced motion', () => {
  runIn(test, 'reduced-motion');

  test('I-09 under reduced motion every [data-ir] click scrolls with behavior "auto"', async ({ page }) => {
    await page.addInitScript(spyScrollIntoView);
    await openPage(page);
    const links = page.locator('a[data-ir]:visible');
    const count = await links.count();
    expect(count, 'visible [data-ir] links (header logo, hero CTAs, nav)').toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i += 1) {
      await page.evaluate(() => { window.__scrolls.length = 0; });
      await links.nth(i).click();
      const calls = await page.evaluate(() => window.__scrolls);
      expect(calls.length, `link #${i} triggers exactly one scrollIntoView`).toBe(1);
      expect(calls[0].behavior, `link #${i} scroll behavior under prefers-reduced-motion`).toBe('auto');
    }
  });
});

test.describe('I-09 without the preference the static path still animates', () => {
  runIn(test, 'desktop');
  test.use({ reducedMotion: 'no-preference' });

  test('I-09 static layout without reduced motion (WebGL unavailable) scrolls smoothly: the fix keys on the preference, not on the mode', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : orig.call(this, type, ...rest); };
    });
    await page.addInitScript(spyScrollIntoView);
    await openPage(page);
    await expect(page.locator('html')).toHaveAttribute('data-modo', 'estatica');
    await page.locator('.h-texto .acciones a[data-ir="1"]').click();
    const calls = await page.evaluate(() => window.__scrolls);
    expect(calls.map((c) => c.behavior), 'scrollIntoView behavior without the preference').toEqual(['smooth']);
  });
});

/* =============================== S8 settled axe scan =============================== */

test.describe('S8 settled axe scan (wcag2a, wcag2aa, wcag22aa; serious/critical outside tests/a11y-baseline.json fail)', () => {
  runIn(test, 'desktop', 'mobile-375', 'reduced-motion');

  const expectModo = async (page, project) => {
    expect(await getModo(page), `${project} runs in ${project === 'reduced-motion' ? 'static' : '3D'} mode`).toBe(project === 'reduced-motion' ? 'estatica' : '3d');
  };

  test('S8 the page at the top and the footer have nothing above the baseline', async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    await openPage(page);
    await waitSettled(page);
    await expectModo(page, project);
    const found = [...(await scanPage(page, project)), ...(await scanSections(page, project, ['footer.pie']))];
    expect(describeFound(found), 'new serious/critical violations').toEqual([]);
  });

  /** Stage scans, split so each test (one page load, 1-2 axe passes) stays well under the 60 s test timeout under software GL. */
  [[0.5, 1.5], [2.5, 3.5], [4.75]].forEach((positions, part) => {
    test(`S8 the stage has nothing above the baseline at P = ${positions.join(', ')} (static: the section once)`, async ({ page }, testInfo) => {
      const project = testInfo.project.name;
      test.skip(project === 'reduced-motion' && part > 0, 'the static layout is scanned once, in the first part');
      await openPage(page);
      await waitSettled(page);
      await expectModo(page, project);
      const baseline = loadBaseline();
      const found = [];
      if (project === 'reduced-motion') {
        found.push(...(await scanSections(page, project, ['#inicio'], baseline)));
      } else {
        const pin = await pinRange(page);
        for (const p of positions) {
          await scrollToP(page, pin, p);
          const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).include('.etapa').analyze();
          found.push(...newViolations(result.violations, baseline, project).map((v) => ({ ...v, target: `P=${p} ${v.target}` })));
        }
      }
      expect(describeFound(found), 'new serious/critical violations in the stage').toEqual([]);
    });
  });

  /** [data-r] reveal items are scanned one by one, at rest (E4-07); chunked for the same timing reason as the stage. */
  const CONTENT_CHUNKS = [
    ['story intro', '.marca .wrap > [data-r]'],
    ['story pillars', '.pilar[data-r]'],
    ['manifesto lines 1-3', '.manifiesto > [data-r]:nth-child(-n+3)'],
    ['manifesto lines 4-5 and close', '.manifiesto > [data-r]:nth-child(n+4), .cierre-m[data-r]'],
    ['closing section', '.cierre [data-r]'],
  ];
  for (const [label, selector] of CONTENT_CHUNKS) {
    test(`S8 ${label} have nothing above the baseline (each reveal item scanned at rest)`, async ({ page }, testInfo) => {
      const project = testInfo.project.name;
      await openPage(page);
      await waitSettled(page);
      await expectModo(page, project);
      expect(await page.locator(selector).count(), `${selector} matches reveal items`).toBeGreaterThan(0);
      expect(describeFound(await scanEach(page, project, selector)), `new serious/critical violations in ${label}`).toEqual([]);
    });
  }
});
