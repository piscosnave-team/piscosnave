/**
 * @spec-handoff
 * @interface ST-PRICE (I-30, I-38): one price source, owner values unchanged
 * @behavior
 *   - NAVE_CONFIG.PRECIOS = {pe:{botella,coleccion}, eu:{botella,coleccion}} exists (JSON block or window.NAVE_CONFIG)
 *   - every price literal in the base HTML is "<n> €" with n a PRECIOS.eu value
 *   - every PE dictionary VALUE price is "S/ <n>" with n in PRECIOS.pe; every EU value price is "€<n>" with n in PRECIOS.eu
 *   - every JS.pe / JS.eu string price follows the same formats (S/ n, €n)
 *   - (green now) the owner's amounts are exactly PE 50/150 and EU 40/120; changing them is an owner decision
 * @edge-cases
 *   - formats are code: PE "S/ 50", EU base-Spanish "40 €", EU English "€40"; rendered output stays byte-identical (T-OWN)
 *   - dictionary KEYS keep their literal prices (they must equal the base HTML); only values are checked here
 * @see ./i18n-parity.spec.js
 * @see ../e2e/owner-text.spec.js
 */
import { expect, test } from '@playwright/test';
import { visibleTextNodes } from './helpers/html.js';
import { precioValues, priceTokens } from './helpers/prices.js';
import { indexPage, loadConfig, loadDictionaries } from './helpers/source.js';

const OWNER = { pe: { botella: 50, coleccion: 150 }, eu: { botella: 40, coleccion: 120 } };
const amounts = (text) => priceTokens(text).map((p) => p.amount);

test.describe('ST-PRICE single price source', () => {
  test('harness: price tokenizer reads all three formats', async () => {
    expect(priceTokens('S/ 50 · €40 · 120 €').map((p) => `${p.form}:${p.amount}`)).toEqual(['S/ n:50', '€n:40', 'n €:120']);
  });

  test('owner amounts are unchanged: PE 50/150, EU 40/120 (characterization, owner-gated I-30)', async () => {
    const d = loadDictionaries();
    const peValues = new Set([...Object.values(d.PE), ...Object.values(d.JS.pe)].flatMap(amounts));
    const euValues = new Set([...Object.values(d.EU), ...Object.values(d.JS.eu)].flatMap(amounts));
    const baseValues = new Set(visibleTextNodes(indexPage().tokens).flatMap((n) => amounts(n.text)));
    expect([...peValues].sort((a, b) => a - b)).toEqual([50, 150]);
    expect([...euValues].sort((a, b) => a - b)).toEqual([40, 120]);
    expect([...baseValues].sort((a, b) => a - b)).toEqual([40, 120]);
  });

  test('NAVE_CONFIG.PRECIOS holds the owner amounts', async () => {
    expect(loadConfig()?.PRECIOS, 'NAVE_CONFIG.PRECIOS').toEqual(OWNER);
  });

  test('every price literal in base HTML, dictionary values and JS strings equals a PRECIOS amount in the right format', async () => {
    const precios = loadConfig()?.PRECIOS;
    expect(precios, 'NAVE_CONFIG.PRECIOS must exist').toBeTruthy();
    const d = loadDictionaries();
    const bad = [];
    const check = (where, text, form, region) => {
      for (const p of priceTokens(text)) if (p.form !== form || !precioValues({ [region]: precios[region] }).has(p.amount)) bad.push(`${where}: "${p.raw}"`);
    };
    for (const n of visibleTextNodes(indexPage().tokens)) check('base HTML', n.text, 'n €', 'eu');
    for (const [k, v] of Object.entries(d.PE)) check(`PE[${k.slice(0, 30)}]`, v, 'S/ n', 'pe');
    for (const [k, v] of Object.entries(d.EU)) check(`EU[${k.slice(0, 30)}]`, v, '€n', 'eu');
    for (const [k, v] of Object.entries(d.JS.pe)) if (typeof v === 'string') check(`JS.pe.${k}`, v, 'S/ n', 'pe');
    for (const [k, v] of Object.entries(d.JS.eu)) if (typeof v === 'string') check(`JS.eu.${k}`, v, '€n', 'eu');
    expect(bad, 'price literals that disagree with PRECIOS').toEqual([]);
  });
});
