/**
 * @spec-handoff
 * @interface ST-CSSFB (I-04): modern CSS used by index.html has an older-browser fallback in the same rule
 * @behavior
 *   - a declaration using svh (e.g. 100svh) is preceded, in the same rule and property, by one without svh (the vh fallback)
 *   - overflow-x/overflow-y: clip is preceded by overflow-x/overflow-y: hidden
 *   - a value using color-mix( is preceded by a plain colour for the same property
 *   - translate: <value> (not none) is preceded by a transform declaration, OR the rule contains a comment with
 *     "css-fallback-exception" explaining why the static layout does not depend on it
 * @edge-cases
 *   - custom properties (--th: min(46svh,...)) are out of scope: duplicating them gives no fallback semantics; Kou may use @supports
 *   - rules nested in @media/@supports are checked; @keyframes contents are not style rules with fallbacks
 *   - the first-viewport look of .presencia must stay identical (visual check lives in E7/E5 baselines)
 * @see ./helpers/css.js
 */
import { expect, test } from '@playwright/test';
import { expectedRed } from '../e2e/helpers/expected-red.js';
import { checkCssFallbacks } from './helpers/css.js';
import { indexPage } from './helpers/source.js';
import { styleBlocks } from './helpers/html.js';

const summarize = (v) => v.map((x) => `${x.selector} { ${x.property}: ${x.value} }  [${x.kind}]`);

test.describe('ST-CSSFB CSS fallbacks', () => {
  test('harness: accepts rules with fallbacks and documented exceptions', async () => {
    const ok = `
      .a{height:100vh;height:100svh}
      @media (max-width:899px){.b{top:calc(1px + 7vh);top:calc(1px + 7svh)}}
      body{overflow-x:hidden;overflow-x:clip}
      .c{background:#eee;background:color-mix(in srgb,red 12%,transparent)}
      .d{transform:translateX(-50%);translate:-50% 0}
      .e{/* css-fallback-exception: static layout does not use it */ translate:0 -46%}
      .f{translate:none}
      :root{--th:min(46svh,440px)}`;
    expect(checkCssFallbacks(ok)).toEqual([]);
  });

  test('harness: flags svh, overflow clip, color-mix and translate without fallbacks', async () => {
    const bad = `.a{height:100svh} .b{overflow-x:clip} .c{background:color-mix(in srgb,red,blue)} .d{translate:-50% 0} .e{top:calc(1px + 2svh);padding-top:10px}`;
    expect(checkCssFallbacks(bad).map((v) => v.kind).sort()).toEqual(['color-mix', 'overflow-clip', 'svh', 'svh', 'translate']);
  });

  test('harness: index.html has CSS to check', async () => {
    const css = styleBlocks(indexPage().tokens).map((b) => b.css).join('\n');
    expect(css.length).toBeGreaterThan(5000);
    expect(css).toContain('svh');
  });

  test('every svh / overflow:clip / color-mix / translate use in index.html has a fallback or documented exception', async () => {
    expectedRed(test, 'E7', 'index.html uses svh, overflow-x:clip, color-mix() and translate: with no fallbacks');
    const css = styleBlocks(indexPage().tokens).map((b) => b.css).join('\n');
    expect(summarize(checkCssFallbacks(css)), 'declarations without a fallback').toEqual([]);
  });
});
