/**
 * @spec-handoff
 * @interface ST-REL (TC11): no root-relative same-origin URL anywhere in index.html or js/**
 * @behavior
 *   - src, href, poster, action, data, srcset candidates, import-map values, CSS url(...) and asset-looking
 *     string literals never start with a single "/"
 *   - protocol-relative (//host), absolute (https://...), fragment (#x) and relative (assets/x.webp, ./x) are fine
 * @edge-cases
 *   - GitHub Pages serves the site under /piscosnave/, so "/assets/x" would 404 in production but pass locally
 *   - SEO absolute URLs (canonical, og:*) are absolute and derive from package.json homepage; they are not checked here
 * @see ../../package.json (homepage is the single base-URL constant)
 */
import { expect, test } from '@playwright/test';
import { isExecutableScript, styleBlocks, tokenize } from './helpers/html.js';
import { stringLiterals } from './helpers/placeholders.js';
import { codeSources, indexPage } from './helpers/source.js';

const ROOT_REL = /^\/(?!\/)/;
const URL_ATTRS = ['src', 'href', 'poster', 'action', 'data'];
const ASSET_LITERAL = /^\/(?!\/)[\w.-]+\/.*\.(?:webp|png|jpe?g|avif|svg|js|mjs|json|css|woff2?)$|^\/[\w.-]+\.(?:webp|png|jpe?g|avif|svg|js|mjs|json|css|woff2?)$/;

function rootRelativeUrls(tokens, codeTexts) {
  const bad = [];
  for (const el of tokens.filter((t) => t.type === 'start')) {
    for (const a of URL_ATTRS) if (typeof el.attrs[a] === 'string' && ROOT_REL.test(el.attrs[a])) bad.push(`<${el.name} ${a}="${el.attrs[a].slice(0, 60)}">`);
    if (typeof el.attrs.srcset === 'string') for (const c of el.attrs.srcset.split(',')) if (ROOT_REL.test(c.trim())) bad.push(`<${el.name} srcset> candidate ${c.trim().slice(0, 60)}`);
  }
  tokens.forEach((t, k) => {
    if (t.type !== 'start' || t.name !== 'script' || String(t.attrs.type).toLowerCase() !== 'importmap') return;
    const text = tokens[k + 1]?.type === 'text' ? tokens[k + 1].text : '{}';
    const map = JSON.parse(text);
    for (const v of [...Object.values(map.imports ?? {}), ...Object.values(map.scopes ?? {}).flatMap((s) => Object.values(s))]) if (ROOT_REL.test(v)) bad.push(`importmap ${v}`);
  });
  for (const { css } of styleBlocks(tokens)) for (const m of css.matchAll(/url\(\s*['"]?(\/(?!\/)[^'")\s]*)/g)) bad.push(`css url(${m[1]})`);
  for (const text of codeTexts) for (const lit of stringLiterals(text)) if (ASSET_LITERAL.test(lit.text)) bad.push(`script literal "${lit.text}"`);
  return bad;
}

test.describe('ST-REL relative URLs', () => {
  test('harness: root-relative URLs are caught in markup, srcset, import map, CSS and code; others pass', async () => {
    const html = `<img src="/a.webp" srcset="x.webp 1x, /y.webp 2x"><a href="/">h</a><script type="importmap">{"imports":{"three":"/v/t.js"}}</script><style>a{background:url(/z.png)}</style>`;
    expect(rootRelativeUrls(tokenize(html), ['const u = "/assets/img/a.webp";'])).toHaveLength(6);
    const fine = `<img src="assets/a.webp" srcset="a.webp 1x, ./b.webp 2x"><a href="#x">h</a><a href="//cdn.test/x">c</a><a href="https://x.test/">e</a><script type="importmap">{"imports":{"three":"./vendor/t.js"}}</script><style>a{background:url(assets/z.png)}</style>`;
    expect(rootRelativeUrls(tokenize(fine), ['const u = "assets/img/a.webp"; const re = "/";'])).toEqual([]);
  });

  test('index.html and js/** contain no root-relative same-origin URL', async () => {
    const texts = codeSources().filter((s) => s.file !== 'index.html').map((s) => s.text);
    const inlineCode = indexPage().scripts.filter(isExecutableScript).map((s) => s.text);
    expect(rootRelativeUrls(indexPage().tokens, [...inlineCode, ...texts]), 'root-relative URLs (break under /piscosnave/)').toEqual([]);
  });
});
