/**
 * @spec-handoff
 * @interface ST-B64: index.html (and js/**) carry no inline raster image payloads
 * @behavior
 *   - zero data:image/(webp|png|jpe?g|gif|avif) URIs in index.html and js/** (E5 moves them to assets/img/)
 *   - data:image/svg+xml is tolerated only for the single favicon <link rel="icon"> until E12 replaces it with files
 *   - after E12 the count of data:image/* URIs is 0
 * @edge-cases
 *   - the texturas JSON block counts: its 8 base64 WebP textures are in index.html today
 *   - the base64 may be in an attribute, a JSON value or a JS string; the check is a plain pattern scan
 * @see ../../.yui-soul/reviews/341-piscosnave-review-340-remediation/spec.md (4.5)
 */
import { expect, test } from '@playwright/test';
import { expectedRed } from '../e2e/helpers/expected-red.js';
import { elements } from './helpers/html.js';
import { codeSources, indexPage } from './helpers/source.js';

const RASTER = /data:image\/(?:webp|png|jpe?g|gif|avif)[;,]/gi;
const SVG = /data:image\/svg\+xml[;,]/gi;
const count = (re, text) => (text.match(re) || []).length;

function allText() {
  const { html } = indexPage();
  return [{ file: 'index.html', text: html }, ...codeSources().filter((s) => s.file !== 'index.html')];
}

test.describe('ST-B64 inline image payloads', () => {
  test('harness: the patterns match real data URIs and ignore ordinary text', async () => {
    expect(count(RASTER, 'src="data:image/webp;base64,AAAA" x="data:image/png,zz" data:image/jpeg;base64,x')).toBe(3);
    expect(count(RASTER, 'data:image/svg+xml;base64,AAAA')).toBe(0);
    expect(count(SVG, 'href="data:image/svg+xml;base64,AAAA"')).toBe(1);
  });

  test('no raster data URIs in index.html or js/**', async () => {
    expectedRed(test, 'E5', 'index.html still embeds 4 base64 WebP <img> and 8 WebP textures');
    const found = allText().map((s) => ({ file: s.file, rasterDataUris: count(RASTER, s.text) })).filter((r) => r.rasterDataUris > 0);
    expect(found, 'files containing raster data URIs (move them to assets/img/)').toEqual([]);
  });

  test('the only svg data URI is the favicon <link rel="icon">', async () => {
    const { html, tokens } = indexPage();
    const faviconLinks = elements(tokens, 'link').filter((l) => /\bicon\b/.test(String(l.attrs.rel)) && /^data:image\/svg\+xml/i.test(String(l.attrs.href)));
    const outsideFavicon = count(SVG, html) - faviconLinks.length;
    expect(outsideFavicon, 'svg data URIs other than the favicon link').toBe(0);
  });

  test('no data:image URIs at all (favicon replaced by static files)', async () => {
    expectedRed(test, 'E12', 'the favicon is still a data:image/svg+xml link; E12 replaces it with assets/icons/*');
    const total = allText().reduce((n, s) => n + count(RASTER, s.text) + count(SVG, s.text), 0);
    expect(total, 'data:image/* URIs remaining').toBe(0);
  });
});
