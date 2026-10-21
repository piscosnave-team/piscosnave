/**
 * @spec-handoff
 * @interface ST-CSP (spec 4.7, decision D14 = b3 + r1): meta Content-Security-Policy and referrer meta
 * @behavior
 *   - exactly the policy shape: <meta http-equiv=Content-Security-Policy> is the first <head> child after <meta charset>
 *   - default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ + one 'sha256-...' per
 *     executable inline script (import map, head boot script); style-src 'self' 'unsafe-inline'; img-src 'self' data:;
 *     connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
 *   - no 'unsafe-inline'/'unsafe-eval' in default-src, script-src, script-src-elem or script-src-attr; script hosts path-pinned to a directory
 *   - none of frame-ancestors, report-uri, report-to, sandbox (ignored in meta; Chromium logs an error)
 *   - <meta name="referrer" content="no-referrer"> present
 * @edge-cases
 *   - hash set must equal the recomputed SHA-256 (base64) of each executable inline script's exact text; JSON blocks are exempt
 *   - an owner edit to an inline script without regenerating hashes must turn this red (npm run csp, E10)
 * @see ./helpers/csp.js
 */
import { expect, test } from '@playwright/test';
import { checkCsp } from './helpers/csp.js';
import { inlineScripts, isExecutableScript, tokenize } from './helpers/html.js';
import { indexPage, sha256Base64 } from './helpers/source.js';

function page(inlineBody, { hash = `sha256-${sha256Base64(Buffer.from(inlineBody, 'utf8'))}`, type = '' } = {}) {
  const csp = `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/${hash ? ` '${hash}'` : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><script${type ? ` type="${type}"` : ''}>${inlineBody}</script></head><body></body></html>`;
}
const run = (html) => {
  const tokens = tokenize(html);
  return checkCsp(tokens, inlineScripts(tokens));
};

test.describe('ST-CSP meta policy', () => {
  test('harness: a conforming page is accepted', async () => {
    expect(run(page('window.a=1'))).toEqual([]);
  });

  test('harness: stale hash, unsafe script source, forbidden directive, wrong position and missing referrer are all flagged', async () => {
    expect(run(page('window.a=1', { hash: 'sha256-AAAA' })).join()).toContain('hash set');
    expect(run(page('x').replace("script-src 'self'", "script-src 'unsafe-inline' 'self'")).join()).toContain("'unsafe-inline'");
    expect(run(page('x').replace("default-src 'self'", "default-src 'self' 'unsafe-inline'")).join()).toContain("default-src must not contain 'unsafe-inline'");
    expect(run(page('x').replace("default-src 'self'", "default-src 'self' 'unsafe-eval'")).join()).toContain("default-src must not contain 'unsafe-eval'");
    expect(run(page('x').replace("form-action 'none'", "form-action 'none'; script-src-elem 'self' 'unsafe-inline'")).join()).toContain("script-src-elem must not contain 'unsafe-inline'");
    expect(run(page('x').replace("form-action 'none'", "form-action 'none'; script-src-attr 'self' 'unsafe-eval'")).join()).toContain("script-src-attr must not contain 'unsafe-eval'");
    expect(run(page('x').replace("object-src 'none'", "object-src 'none'; frame-ancestors 'none'")).join()).toContain('frame-ancestors');
    expect(run(page('x').replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="x" content="y">')).join()).toContain('first <head> child');
    expect(run(page('x').replace('<meta name="referrer" content="no-referrer">', '')).join()).toContain('referrer');
    expect(run('<html><head><meta charset="utf-8"></head><body></body></html>').join()).toContain('no <meta http-equiv');
  });

  test('harness: executable inline scripts without hashes fail, while JSON-LD data blocks without hashes pass', async () => {
    expect(run(page('window.a=1', { hash: '' })).join()).toContain('hash set');
    expect(run(page('{"@context":"https://schema.org"}', { hash: '', type: 'application/ld+json' }))).toEqual([]);
  });

  test('index.html carries the agreed CSP and referrer policy', async () => {
    const { tokens, scripts } = indexPage();
    expect(checkCsp(tokens, scripts), 'CSP violations').toEqual([]);
  });

  test('the CSP hash set follows the exact current inline executable-script bytes', async () => {
    const { tokens, scripts } = indexPage();
    const csp = tokens.find((t) => t.type === 'start' && t.name === 'meta' && String(t.attrs['http-equiv']).toLowerCase() === 'content-security-policy');
    const actual = new Set((String(csp?.attrs.content || '').match(/'sha256-[^']+'/g) || []).map((hash) => hash.slice(1, -1)));
    const expected = new Set(scripts.filter(isExecutableScript).map((script) => `sha256-${sha256Base64(Buffer.from(script.text, 'utf8'))}`));
    expect(actual).toEqual(expected);
  });

});
