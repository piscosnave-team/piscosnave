/**
 * @spec-handoff
 * @interface ST-SRI: every external <script src> / stylesheet <link href> is integrity-protected
 * @behavior
 *   - each external script (http://, https://, //) has integrity="sha384-..." or "sha512-..." of the right base64 length
 *   - each such element has crossorigin="anonymous"
 *   - same-origin resources are exempt (vendored three is covered by ST-VEND)
 * @edge-cases
 *   - the importmap URL is JSON, not a <script src>; it is removed by E5 (vendored three)
 *   - rel=icon/canonical/preconnect links are not fetched as code and are ignored
 *   - an on-demand script (not CI) re-fetches and verifies the hashes (E10)
 * @see ../../.yui-soul/reviews/341-piscosnave-review-340-remediation/spec.md (4.7)
 */
import { expect, test } from '@playwright/test';
import { expectedRed } from '../e2e/helpers/expected-red.js';
import { tokenize } from './helpers/html.js';
import { indexPage } from './helpers/source.js';

const EXTERNAL = /^(?:https?:)?\/\//i;
const CODE_REL = /\b(stylesheet|modulepreload|preload)\b/i;
const SHA = { sha384: 64, sha512: 88 };

function sriViolations(tokens) {
  const v = [];
  for (const el of tokens.filter((t) => t.type === 'start')) {
    const url = el.name === 'script' ? el.attrs.src : el.name === 'link' && CODE_REL.test(String(el.attrs.rel)) ? el.attrs.href : undefined;
    if (typeof url !== 'string' || !EXTERNAL.test(url)) continue;
    const integrity = typeof el.attrs.integrity === 'string' ? el.attrs.integrity.trim().split(/\s+/) : [];
    const valid = integrity.length > 0 && integrity.every((h) => {
      const m = /^(sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(h);
      return m && m[2].length === SHA[m[1]];
    });
    if (!valid) v.push(`${url}: missing or malformed integrity`);
    if (el.attrs.crossorigin !== 'anonymous') v.push(`${url}: crossorigin="anonymous" required`);
  }
  return v;
}

const sha384 = `sha384-${'A'.repeat(64)}`;

test.describe('ST-SRI subresource integrity guard', () => {
  test('harness: accepts a protected script, flags missing/short integrity and missing crossorigin, ignores same-origin', async () => {
    expect(sriViolations(tokenize(`<script src="https://x.test/a.js" integrity="${sha384}" crossorigin="anonymous"></script>`))).toEqual([]);
    expect(sriViolations(tokenize('<script src="https://x.test/a.js"></script>'))).toHaveLength(2);
    expect(sriViolations(tokenize('<script src="//x.test/a.js" integrity="sha384-short" crossorigin="anonymous"></script>'))).toHaveLength(1);
    expect(sriViolations(tokenize('<script src="js/app.js"></script><link rel="icon" href="https://x.test/i.png">'))).toEqual([]);
  });

  test('harness: index.html has external scripts, so the guard is not vacuous', async () => {
    const external = indexPage().tokens.filter((t) => t.type === 'start' && t.name === 'script' && EXTERNAL.test(String(t.attrs.src)));
    expect(external.length).toBeGreaterThanOrEqual(2); // gsap + ScrollTrigger stay on the CDN (D4)
  });

  test('every external script/stylesheet in index.html has integrity and crossorigin="anonymous"', async () => {
    expectedRed(test, 'E10', 'the two GSAP <script> tags have no integrity/crossorigin yet');
    expect(sriViolations(indexPage().tokens), 'SRI violations').toEqual([]);
  });
});
