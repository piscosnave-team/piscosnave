/**
 * @spec-handoff
 * @interface harness self-checks for tests/static/helpers/* (html tokenizer, literal extraction, config/dictionary loading)
 * @behavior
 *   - tokenize() reads attributes (quoted, single-quoted, unquoted, boolean), raw-text elements, comments, void elements and entities
 *   - visibleTextNodes() mirrors the page's i18n walker (body only; no script/style/svg/noscript)
 *   - extractObjectLiteral()/evalLiteral() read balanced object literals with strings, template literals and comments
 *   - loadConfig() and loadDictionaries() find the config and dictionaries in the current page layout
 * @edge-cases
 *   - braces and quotes inside strings/templates/comments must not unbalance the scan
 *   - a "</script>" look-alike inside an attribute value is not an end tag
 * @see ./helpers/html.js
 * @see ./helpers/source.js
 */
import { expect, test } from '@playwright/test';
import { attributeKeys, inlineScripts, isExecutableScript, tokenize, visibleTextNodes } from './helpers/html.js';
import { evalLiteral, extractObjectLiteral, loadConfig, loadDictionaries } from './helpers/source.js';

test.describe('static helpers: html tokenizer', () => {
  test('reads attributes, raw text, comments, void elements and entities', async () => {
    const t = tokenize(`<!doctype html><body><!-- c <b> --><a href='#x' data-a=b hidden title="a &amp; b">T &lt;1&gt;</a><br><img alt="" src="a.png"><script type="module">if (a<b && b>c) {}</script><p>after</p></body>`);
    const a = t.find((x) => x.type === 'start' && x.name === 'a');
    expect(a.attrs).toEqual({ href: '#x', 'data-a': 'b', hidden: true, title: 'a & b' });
    expect(visibleTextNodes(t).map((n) => n.text)).toEqual(['T <1>', 'after']);
    const script = inlineScripts(t)[0];
    expect(script.text).toBe('if (a<b && b>c) {}');
    expect(isExecutableScript(script)).toBe(true);
    expect(t.some((x) => x.type === 'comment' && x.text.includes('<b>'))).toBe(true);
    expect(attributeKeys(t).map((k) => `${k.attr}=${k.text}`)).toEqual(['alt=']);
  });

  test('visible text excludes script, style, svg, noscript and head; attribute keys exclude svg', async () => {
    const t = tokenize(`<head><title>Head</title></head><body><svg aria-label="no"><text>svgtext</text></svg><style>x{}</style><noscript>ns</noscript><p aria-label="yes">ok</p></body>`);
    expect(visibleTextNodes(t).map((n) => n.text)).toEqual(['ok']);
    expect(attributeKeys(t).map((k) => k.text)).toEqual(['yes']);
  });

  test('json data blocks are not executable, classic, module and importmap are', async () => {
    const t = tokenize('<script type="application/json" id="d">{}</script><script type="importmap">{}</script><script>1</script><script src="a.js"></script>');
    expect(inlineScripts(t).map(isExecutableScript)).toEqual([false, true, true]);
  });
});

test.describe('static helpers: literal extraction and page data', () => {
  test('extractObjectLiteral survives braces in strings, templates and comments', async () => {
    const src = "const X = { a: 'x}', b: `t${ {k:1}.k }}`, /* } */ c: \"{\" }; const Y = 1;";
    const literal = extractObjectLiteral(src, /\bconst\s+X\s*=\s*/);
    expect(literal.endsWith('"{" }')).toBe(true);
    expect(evalLiteral(literal)).toEqual({ a: 'x}', b: 't1}', c: '{' });
  });

  test('evalLiteral exposes only the page config', async () => {
    expect(evalLiteral('{ n: PRECIOS.pe.botella }', { PRECIOS: { pe: { botella: 50 } } })).toEqual({ n: 50 });
    expect(() => evalLiteral('{ x: process.pid }')).toThrow();
  });

  test('loadConfig finds NAVE_CONFIG (WHATSAPP present for pe and eu)', async () => {
    const c = loadConfig();
    expect(c, 'NAVE_CONFIG not found: JSON block #nave-config or window.NAVE_CONFIG = {...}').toBeTruthy();
    expect(Object.keys(c.WHATSAPP).sort()).toEqual(['eu', 'pe']);
  });

  test('loadDictionaries returns evaluated PE, EU and JS', async () => {
    const d = loadDictionaries();
    expect(typeof d.JS.pe.wa).toBe('function');
    expect(d.JS.pe.lang).toBe('es-PE');
    expect(d.JS.eu.lang).toBe('en');
  });
});
