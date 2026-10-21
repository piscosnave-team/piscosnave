/**
 * @spec-handoff
 * @interface ST-ANCH: every in-page reference in index.html resolves to a declared id
 * @behavior
 *   - every href="#x" (links and svg <use>) has an element with id="x"; bare href="#" is rejected
 *   - aria-controls / aria-labelledby / aria-describedby / label[for] ids exist
 * @edge-cases
 *   - ids built by JS template literals (c${id}) are invisible here and are not counted
 *   - ids inside <noscript> count (the no-JS age gate in E7 uses #edad-pasa as a :target link)
 *   - e2e specs must use scoped selectors (header [data-region=eu], #edad [data-region=eu]) - I-43
 * @see ../../index.html
 */
import { expect, test } from '@playwright/test';
import { declaredIds, elements } from './helpers/html.js';
import { indexPage } from './helpers/source.js';

const ID_LIST_ATTRS = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for'];

function brokenReferences(tokens) {
  const ids = new Set(declaredIds(tokens));
  const broken = [];
  for (const el of elements(tokens)) {
    const href = el.attrs.href ?? el.attrs['xlink:href'];
    if (typeof href === 'string' && href.startsWith('#')) {
      if (href === '#') broken.push(`<${el.name}> has a bare href="#"`);
      else if (!ids.has(href.slice(1))) broken.push(`<${el.name} href="${href}"> has no target id`);
    }
    for (const attr of ID_LIST_ATTRS) {
      if (typeof el.attrs[attr] !== 'string') continue;
      for (const id of el.attrs[attr].split(/\s+/).filter(Boolean)) if (!ids.has(id)) broken.push(`<${el.name} ${attr}="${id}"> has no target id`);
    }
  }
  return broken;
}

test.describe('ST-ANCH anchors and id references', () => {
  test('harness: the checker flags a missing target and accepts a present one', async () => {
    const { tokenize } = await import('./helpers/html.js');
    expect(brokenReferences(tokenize('<a href="#a">x</a><p id="a"></p>'))).toEqual([]);
    expect(brokenReferences(tokenize('<a href="#nope">x</a><a href="#">y</a><button aria-controls="gone"></button>'))).toHaveLength(3);
  });

  test('harness: index.html exposes enough anchors for the check not to be vacuous', async () => {
    const links = elements(indexPage().tokens).filter((e) => typeof e.attrs.href === 'string' && e.attrs.href.startsWith('#'));
    expect(links.length).toBeGreaterThan(15);
  });

  test('every href="#x" and ARIA id reference in index.html resolves to a declared id', async () => {
    expect(brokenReferences(indexPage().tokens), 'broken in-page references').toEqual([]);
  });
});
