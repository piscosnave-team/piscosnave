/**
 * @spec-handoff
 * @interface T-TEX: the 8 WebP textures are real files fetched only after the WebGL check (spec 4.5, I-13, S7c)
 * @behavior
 *   - 3D path (desktop, SwiftShader): the page requests exactly the 8 files assets/img/tex/<key>.webp, all HTTP 200
 *   - none of those requests starts before the first successful WebGL context is created (resource startTime >= context time)
 *   - WebGL unavailable (getContext stub returns null for webgl/webgl2): mode is static and 0 requests go to assets/img/tex/
 *   - reduced motion (static layout by design): 0 requests go to assets/img/tex/
 * @edge-cases
 *   - the two "0 requests" tests first assert that the 8 texture files exist, otherwise they would pass vacuously
 *     while the textures are still inline base64 (data: URIs produce no network request at all)
 *   - texture keys come from tests/static/fixtures/original-assets.json (the a20e3de textures), not from the page
 * @see ../static/fixtures/original-assets.json
 * @see ./helpers/ready.js
 */
import { existsSync, readFileSync } from 'node:fs';
import { expectedRed } from './helpers/expected-red.js';
import { expect, openPage, test } from './helpers/page.js';
import { runIn } from './helpers/projects.js';
import { getModo, waitSettled } from './helpers/ready.js';
import { ROOT } from '../static/helpers/source.js';

const ORIGINALS = JSON.parse(readFileSync(new URL('../static/fixtures/original-assets.json', import.meta.url), 'utf8'));
const KEYS = ORIGINALS.files.filter((f) => f.file.startsWith('assets/img/tex/')).map((f) => f.file.replace(/^assets\/img\/tex\/(.+)\.webp$/, '$1')).sort();
const TEX_URL = /\/assets\/img\/tex\/([\w-]+)\.webp(?:\?.*)?$/;

/** Records every request to assets/img/tex/. */
function trackTextures(page) {
  const hits = [];
  page.on('request', (r) => {
    const m = TEX_URL.exec(r.url());
    if (m) hits.push(m[1]);
  });
  return hits;
}

/** Init script: WebGL contexts report null (the page must fall back to its static layout). */
const noWebgl = () => {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
    if (/^(?:experimental-)?webgl2?$/.test(String(type))) return null;
    return real.call(this, type, ...rest);
  };
};

/** Init script: remembers when the first real WebGL context was created (performance.now timeline). */
const recordContextTime = () => {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
    const ctx = real.call(this, type, ...rest);
    if (ctx && /^(?:experimental-)?webgl2?$/.test(String(type)) && window.__glAt === undefined) window.__glAt = performance.now();
    return ctx;
  };
};

const missingFiles = () => KEYS.filter((k) => !existsSync(`${ROOT}assets/img/tex/${k}.webp`));

test.describe('T-TEX textures load after the WebGL check', () => {
  test('harness: the fixture lists the 8 texture keys', async () => {
    expect(KEYS).toEqual(['donaire-body', 'donaire-brillo', 'nii-body', 'nii-brillo', 'nii-extra', 'sunqu-body', 'sunqu-brillo', 'sunqu-extra']);
  });

  test.describe('3D path', () => {
    runIn(test, 'desktop');

    test('T-TEX the 8 textures are fetched as files, each only after the first WebGL context exists', async ({ page, errors }) => {
      expectedRed(test, 'E5', 'textures are base64 data URIs today: the page makes 0 requests to assets/img/tex/');
      const hits = trackTextures(page);
      await page.addInitScript(recordContextTime);
      await openPage(page);
      await waitSettled(page);
      expect(await getModo(page), 'the 3D path must be active for this test').toBe('3d');

      expect([...new Set(hits)].sort(), 'texture files requested').toEqual(KEYS);
      expect(hits.length, 'each texture is requested exactly once').toBe(KEYS.length);
      expect(errors.badResponses, 'texture responses must not be >= 400').toEqual([]);

      const timing = await page.evaluate(() => ({
        glAt: window.__glAt,
        starts: performance.getEntriesByType('resource').filter((e) => /\/assets\/img\/tex\//.test(e.name)).map((e) => ({ name: e.name.split('/').pop(), start: e.startTime })),
      }));
      expect(timing.glAt, 'a WebGL context was created').toBeGreaterThan(0);
      expect(timing.starts, 'resource timing entries for the textures').toHaveLength(KEYS.length);
      const early = timing.starts.filter((s) => s.start < timing.glAt).map((s) => `${s.name} @${s.start.toFixed(0)}ms < context @${timing.glAt.toFixed(0)}ms`);
      expect(early, 'textures requested before the WebGL context existed').toEqual([]);
    });
  });

  test.describe('static path: WebGL unavailable', () => {
    runIn(test, 'desktop');

    test('T-TEX with no WebGL the page is static and requests 0 textures', async ({ page }) => {
      expectedRed(test, 'E5', 'assets/img/tex/*.webp do not exist yet (precondition), so this guard would otherwise pass vacuously');
      expect(missingFiles(), 'precondition: texture files exist, so a request would be possible').toEqual([]);
      const hits = trackTextures(page);
      await page.addInitScript(noWebgl);
      await openPage(page);
      await waitSettled(page);
      await page.waitForLoadState('networkidle');
      expect(await getModo(page), 'no WebGL means the static layout').toBe('estatica');
      expect(hits, 'texture requests on the static path').toEqual([]);
    });
  });

  test.describe('static path: reduced motion', () => {
    runIn(test, 'reduced-motion');

    test('T-TEX with prefers-reduced-motion the page is static and requests 0 textures', async ({ page }) => {
      expectedRed(test, 'E5', 'assets/img/tex/*.webp do not exist yet (precondition), so this guard would otherwise pass vacuously');
      expect(missingFiles(), 'precondition: texture files exist, so a request would be possible').toEqual([]);
      const hits = trackTextures(page);
      await openPage(page);
      await waitSettled(page);
      await page.waitForLoadState('networkidle');
      expect(await getModo(page), 'reduced motion means the static layout').toBe('estatica');
      expect(hits, 'texture requests on the static path').toEqual([]);
    });
  });
});
