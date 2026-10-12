/**
 * @spec-handoff
 * @interface ST-I18N (I-38): index.html text <-> PE/EU dictionaries <-> JS.pe/JS.eu strings stay in sync
 * @behavior
 *   - every PE and EU dictionary key equals, verbatim, a trimmed base-HTML text node or alt/aria-label value
 *   - every translatable base-HTML text node has an EU entry, except the explicit proper-noun/symbol allow-list
 *   - JS.pe and JS.eu expose identical key sets
 *   - price-bearing dictionary keys only carry amounts that exist in NAVE_CONFIG.PRECIOS (red until E5)
 *   - the approved new UI strings exist in both languages (red until E9: new-window cue)
 * @edge-cases
 *   - empty alt="" / aria-label="" are untranslatable by design and ignored
 *   - noscript, script, style and svg subtrees are not translated (same filter as the page walker)
 *   - dictionaries must stay evaluable by helpers/source.js (sandbox: window.NAVE_CONFIG, PRECIOS)
 * @see ./helpers/source.js
 * @see ./price.spec.js
 */
import { expect, test } from '@playwright/test';
import { expectedRed } from '../e2e/helpers/expected-red.js';
import { attributeKeys, visibleTextNodes } from './helpers/html.js';
import { indexPage, loadConfig, loadDictionaries } from './helpers/source.js';
import { precioValues, priceTokens } from './helpers/prices.js';

/** Proper nouns, brand names and symbols that are identical in English (or are not words). */
const ALLOW_UNTRANSLATED = [
  'PE · S/',
  'EU · €',
  'Pisco',
  'Pisco Premium',
  'Donaire',
  'Donaire:',
  'Sunqu',
  'Sunqu:',
  'Nii',
  'Nii:',
  'Donaire · Donaire · Donaire',
  'Sunqu · Sunqu · Sunqu · Sunqu',
  'Nii · Nii · Nii · Nii · Nii · Nii',
  '©',
  /^\d{4}$/, // the footer year
];
const allowed = (key) => ALLOW_UNTRANSLATED.some((a) => (a instanceof RegExp ? a.test(key) : a === key));

/** Approved new UI strings (spec 4.0), ES -> EN. */
const APPROVED_NEW = [
  { es: 'Saltar al contenido', en: 'Skip to content' },
  { es: 'Ir al pedido', en: 'Go to order' },
  { es: '(se abre en una ventana nueva)', en: '(opens in a new window)', step: 'E9', why: 'target=_blank cue (L5, I-11) does not exist yet' },
];

const domKeys = () => {
  const { tokens } = indexPage();
  return [
    ...visibleTextNodes(tokens).map((n) => n.text),
    ...attributeKeys(tokens).map((a) => a.text).filter((t) => t.trim() !== ''),
  ];
};

test.describe('ST-I18N dictionary parity', () => {
  test('harness: the page yields a realistic key set and both dictionaries load', async () => {
    const d = loadDictionaries();
    expect(d.EU, 'const EU dictionary not found in the page code').toBeTruthy();
    expect(d.PE, 'const PE dictionary not found in the page code').toBeTruthy();
    expect(d.JS && d.JS.pe && d.JS.eu, 'const JS = {pe, eu} not found in the page code').toBeTruthy();
    expect(new Set(domKeys()).size).toBeGreaterThan(50);
    expect(Object.keys(d.EU).length).toBeGreaterThan(50);
  });

  test('every PE/EU dictionary key exists verbatim in the base HTML (no orphan keys)', async () => {
    const d = loadDictionaries();
    const keys = new Set(domKeys());
    const orphans = [
      ...Object.keys(d.PE).filter((k) => !keys.has(k)).map((k) => `PE: ${k}`),
      ...Object.keys(d.EU).filter((k) => !keys.has(k)).map((k) => `EU: ${k}`),
    ];
    expect(orphans, 'dictionary keys with no matching base-HTML text (a copy edit silently breaks translation)').toEqual([]);
  });

  test('every translatable base-HTML text has an EU entry (explicit allow-list for proper nouns and symbols)', async () => {
    const d = loadDictionaries();
    const missing = [...new Set(domKeys())].filter((k) => !(k in d.EU) && !allowed(k));
    expect(missing, 'base-HTML texts with no EU translation and not on the allow-list').toEqual([]);
  });

  test('JS.pe and JS.eu expose identical key sets', async () => {
    const { JS } = loadDictionaries();
    expect(Object.keys(JS.eu).sort()).toEqual(Object.keys(JS.pe).sort());
  });

  test('price-bearing dictionary keys carry only amounts from NAVE_CONFIG.PRECIOS (I-38)', async () => {
    const precios = loadConfig()?.PRECIOS;
    expect(precios, 'NAVE_CONFIG.PRECIOS (the single price source) must exist').toBeTruthy();
    const allowedAmounts = precioValues(precios);
    const d = loadDictionaries();
    const stray = Object.keys({ ...d.PE, ...d.EU })
      .flatMap((k) => priceTokens(k).map((p) => ({ k, amount: p.amount })))
      .filter((p) => !allowedAmounts.has(p.amount));
    expect(stray, 'price literals in dictionary keys that are not in PRECIOS').toEqual([]);
  });

  for (const s of APPROVED_NEW) {
    test(`approved new string "${s.es}" exists in the base HTML and is translated to "${s.en}"`, async () => {
      if (s.step) expectedRed(test, s.step, s.why);
      expect(new Set(domKeys()).has(s.es), `base HTML must contain the text "${s.es}"`).toBe(true);
      expect(loadDictionaries().EU[s.es], `EU dictionary entry for "${s.es}"`).toBe(s.en);
    });
  }
});
