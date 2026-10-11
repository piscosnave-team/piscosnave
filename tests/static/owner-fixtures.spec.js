/**
 * @spec-handoff
 * @interface integrity of the T-OWN fixtures, the owner-text differ and the axe baseline file
 * @behavior
 *   - tests/static/fixtures/owner-text-{pe,eu}.json exist, are non-trivial and keep the WhatsApp number out (only {{WA}})
 *   - diffOwnerText() ignores exactly the approved additions and reports any other change
 *   - tests/a11y-baseline.json is valid; every entry names an owning finding id
 * @edge-cases
 *   - a one-character copy change, a price change or a changed wa.me message must each be reported
 * @see ../e2e/helpers/owner-text.js
 * @see ../e2e/helpers/axe.js
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { baselineProblems, loadBaseline } from '../e2e/helpers/axe.js';
import { diffOwnerText, readFixture } from '../e2e/helpers/owner-text.js';
import { loadConfig } from './helpers/source.js';

test.describe('T-OWN fixtures', () => {
  for (const region of ['pe', 'eu']) {
    test(`fixture owner-text-${region}.json is complete and holds no WhatsApp number`, async () => {
      const f = readFixture(region);
      expect(f.region).toBe(region);
      expect(f.textNodes.length).toBeGreaterThan(80);
      expect(f.waLinks.length).toBeGreaterThanOrEqual(5);
      expect(f.waLinks.every((l) => l.href.startsWith('https://wa.me/{{WA}}?text='))).toBe(true);
      expect(f.whatsappConfigSha256).toMatch(/^[0-9a-f]{64}$/);
      const raw = readFileSync(new URL(`fixtures/owner-text-${region}.json`, import.meta.url), 'utf8');
      for (const n of Object.values(loadConfig().WHATSAPP)) expect(raw.includes(String(n).replace(/\D/g, ''))).toBe(false);
    });
  }

  test('differ: identical passes; approved additions pass; any other change is reported', async () => {
    const f = readFixture('pe');
    const clone = () => structuredClone(f);
    expect(diffOwnerText(clone(), f)).toEqual([]);

    const added = clone();
    added.textNodes.splice(2, 0, 'Saltar al contenido', 'Ir al pedido');
    added.textNodes.push('(se abre en una ventana nueva)');
    const gate = added.textNodes.indexOf('Tengo 18 años o más');
    added.textNodes.splice(gate + 1, 0, 'Tengo 18 años o más');
    expect(diffOwnerText(added, f)).toEqual([]);

    const copy = clone();
    copy.textNodes[10] += '.';
    expect(diffOwnerText(copy, f).join()).toContain('textNodes differ');
    const price = clone();
    price.textNodes = price.textNodes.map((t) => t.replace('S/ 50', 'S/ 55'));
    expect(diffOwnerText(price, f).join()).toContain('textNodes differ');
    const wa = clone();
    wa.waLinks[0].href = wa.waLinks[0].href.replace('Hola', 'Buenas');
    expect(diffOwnerText(wa, f)).toContain('[data-wa] hrefs differ');
    const number = clone();
    number.whatsappConfigSha256 = '0'.repeat(64);
    expect(diffOwnerText(number, f).join()).toContain('whatsappConfigSha256');
  });
});

test.describe('axe baseline file', () => {
  test('tests/a11y-baseline.json is valid and every entry names an owning finding', async () => {
    expect(baselineProblems(loadBaseline())).toEqual([]);
  });

  test('baselineProblems rejects entries without an owning finding id', async () => {
    expect(baselineProblems({ 'color-contrast': [{ target: '#x' }] })).toHaveLength(1);
    expect(baselineProblems({ 'color-contrast': [{ target: '#x', finding: 'I-07' }] })).toEqual([]);
    expect(baselineProblems([])).toHaveLength(1);
  });
});
