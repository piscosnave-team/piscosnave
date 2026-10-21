/**
 * First-view byte budget measurement (spec 4.6, P1). Computed here, in the test, so it does not depend on
 * server compression: text types are gzip -9 of the decoded body, images are the raw body length.
 *
 * Counted:   every response for the document and every request initiated before DOMContentLoaded,
 *            plus the hero candidate the browser selected (currentSrc) even if it started later.
 * Excluded:  the 3D library (vendor/three/** and the CDN build of three used before E5), assets/img/tex/**,
 *            every loading=lazy image, and the 3D path's own module (js/escena.js).
 */
import { gzipSync } from 'node:zlib';

export const BUDGET_BYTES = 307_200;

const EXCLUDED = [
  { why: '3D library (vendor/three)', re: /\/vendor\/three\// },
  { why: '3D library (three CDN build)', re: /\/three(?:\.module)?(?:\.min)?\.js(?:\?.*)?$/ },
  { why: '3D module (js/escena.js)', re: /\/js\/escena\.js(?:\?.*)?$/ },
  { why: 'texture (assets/img/tex)', re: /\/assets\/img\/tex\// },
];
const TEXT = /(?:html|css|javascript|ecmascript|json|svg|xml)/i;

/** Call BEFORE page.goto. Returns an object with `report(page)` to call after the page is ready. */
export function trackFirstView(page) {
  const seen = [];
  let phase = 'pre';
  page.on('domcontentloaded', () => { phase = 'post'; });
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) seen.push({ request, phase });
  });

  return {
    async report() {
      const dom = await page.evaluate(() => ({
        hero: (document.querySelector('.h-respaldo') || {}).currentSrc || '',
        lazy: [...document.querySelectorAll('img[loading="lazy"]')].map((i) => i.currentSrc || i.src).filter(Boolean),
      }));
      const rows = [];
      for (const { request, phase: startedIn } of seen) {
        const url = request.url();
        const isHero = dom.hero !== '' && url === dom.hero;
        if (startedIn !== 'pre' && !isHero) continue;
        const response = await request.response();
        if (!response) continue;
        let body;
        try {
          body = await response.body();
        } catch {
          continue; // e.g. a request aborted after the page settled
        }
        const type = response.headers()['content-type'] || '';
        const text = TEXT.test(type);
        const excluded = EXCLUDED.find((e) => e.re.test(url))?.why || (dom.lazy.includes(url) ? 'lazy image' : '');
        rows.push({ url, type: type.split(';')[0], raw: body.length, counted: text ? gzipSync(body, { level: 9 }).length : body.length, excluded });
      }
      const total = rows.filter((r) => !r.excluded).reduce((n, r) => n + r.counted, 0);
      const lines = rows.map((r) => `${r.excluded ? 'excluded' : 'counted '} ${String(r.counted).padStart(8)} B  ${r.url.length > 90 ? `${r.url.slice(0, 87)}...` : r.url}${r.excluded ? `  (${r.excluded})` : ''}`);
      return { total, rows, hero: dom.hero, breakdown: `${lines.join('\n')}\ntotal counted: ${total} B (budget ${BUDGET_BYTES} B)` };
    },
  };
}
