/**
 * @spec-handoff
 * @interface ST-WA-DEFAULTS: the no-JS default [data-wa] hrefs in index.html equal what NAVE_WA builds for region pe
 * @behavior
 *   - every [data-wa] element in index.html has href === `https://wa.me/<digits of nave-config WHATSAPP.pe>?text=<encodeURIComponent(JS.pe.wa(data-wa))>`
 *   - the expected value is computed at test time from the nave-config block and the js/app.js dictionary (nothing is copied here)
 *   - the page has at least 5 such links (3 editions, the order CTA, the footer link)
 * @edge-cases
 *   - the owner changes the number in nave-config but not in the hrefs: fails naming the "number" and the fix, without printing it
 *   - the owner edits a message in js/app.js but not in the hrefs: fails with the decoded expected and actual text
 *   - number values are owner-gated: failure messages report counts and positions, never the digits
 * @see ../../js/app.js (NAVE_WA)
 * @see ./whatsapp-isolation.spec.js
 * @see ../e2e/resilience.spec.js (S7e)
 */
import { expect, test } from '@playwright/test';
import { elements } from './helpers/html.js';
import { indexPage, loadConfig, loadDictionaries } from './helpers/source.js';

const digits = (n) => String(n ?? '').replace(/\D/g, '');
const HREF = /^https:\/\/wa\.me\/(\d*)\?text=(.*)$/;

/** What NAVE_WA (js/app.js) sets as href for region pe. */
const expectedHref = (config, wa, edition) => `https://wa.me/${digits((config.WHATSAPP || {}).pe)}?text=${encodeURIComponent(wa(edition))}`;

/**
 * Problems with the default wa.me hrefs of `links` ([{dataWa, href}]), empty when they are all byte-equal to NAVE_WA's output.
 * The number is owner-gated: it is compared, never printed.
 */
function defaultHrefProblems(links, config, wa) {
  const problems = [];
  const wantNumber = digits((config.WHATSAPP || {}).pe);
  links.forEach((l, i) => {
    const label = `[data-wa="${l.dataWa}"] #${i}`;
    const want = expectedHref(config, wa, l.dataWa);
    if (l.href === want) return;
    const m = HREF.exec(l.href ?? '');
    if (!m) { problems.push(`${label}: href is not a https://wa.me/<digits>?text=... link`); return; }
    if (m[1] !== wantNumber) {
      problems.push(`${label}: the number in href differs from nave-config WHATSAPP.pe (values withheld, owner-gated); update every default [data-wa] href when the number changes`);
    }
    let text;
    try { text = decodeURIComponent(m[2]); } catch { text = m[2]; }
    if (m[2] !== encodeURIComponent(wa(l.dataWa))) {
      problems.push(`${label}: message differs from JS.pe.wa(${JSON.stringify(l.dataWa)}); expected ${JSON.stringify(wa(l.dataWa))}, got ${JSON.stringify(text)}`);
    }
  });
  return problems;
}

const pageLinks = () => elements(indexPage().tokens).filter((t) => t.attrs['data-wa'] !== undefined).map((t) => ({ dataWa: t.attrs['data-wa'], href: t.attrs.href }));

test.describe('ST-WA-DEFAULTS no-JS wa.me hrefs match NAVE_WA', () => {
  const FAKE = { WHATSAPP: { pe: '+11 (222) 333-4444', eu: '5550000' } };
  const wa = (ed) => (ed ? `Hola ${ed}, ¿qué tal?` : 'Hola, quiero pedir');
  const good = (ed) => ({ dataWa: ed, href: expectedHref(FAKE, wa, ed) });

  test('harness: accepts matching defaults and reports a changed number, a changed message and a malformed href', async () => {
    const links = [good('A'), good(''), good('B')];
    expect(defaultHrefProblems(links, FAKE, wa)).toEqual([]);

    const renumbered = { WHATSAPP: { pe: '99900011122' } };
    const num = defaultHrefProblems(links, renumbered, wa);
    expect(num).toHaveLength(3);
    expect(num.join('\n')).toContain('number in href differs from nave-config WHATSAPP.pe');
    expect(num.join('\n'), 'the number is never printed').not.toMatch(/\d{7}/);

    const edited = [good('A'), { dataWa: '', href: good('').href.replace('quiero', 'queremos') }];
    const msg = defaultHrefProblems(edited, FAKE, wa);
    expect(msg).toHaveLength(1);
    expect(msg[0]).toContain('message differs from JS.pe.wa("")');

    expect(defaultHrefProblems([{ dataWa: 'A', href: 'https://example.com/' }, { dataWa: 'B', href: undefined }], FAKE, wa)).toHaveLength(2);
  });

  test('every default [data-wa] href in index.html is byte-equal to what NAVE_WA builds for region pe from nave-config', async () => {
    const config = loadConfig();
    expect(config?.WHATSAPP, 'nave-config must declare WHATSAPP').toBeTruthy();
    expect(digits(config.WHATSAPP.pe), 'WHATSAPP.pe must hold a number').not.toBe('');
    const wa = loadDictionaries().JS?.pe?.wa;
    expect(typeof wa, 'JS.pe.wa (the message builder in js/app.js) must be evaluable').toBe('function');
    const links = pageLinks();
    expect(links.length, 'index.html [data-wa] links (3 editions, order CTA, footer)').toBeGreaterThanOrEqual(5);
    expect(defaultHrefProblems(links, config, wa), 'no-JS default wa.me hrefs out of sync with nave-config / NAVE_WA').toEqual([]);
  });
});
