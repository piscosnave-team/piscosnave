/**
 * T-OWN: owner-gated byte-identity (spec 4.11). Records and compares everything a visitor can read:
 * visible text nodes, alt/aria-label values, title, meta description, lang and every [data-wa] href
 * after JS ran. The WhatsApp number never lands in a fixture: hrefs store the {{WA}} token, and the
 * configured numbers are covered by a SHA-256 of their normalized value (a hash is not a copy).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const FIXTURE_DIR = new URL('../../static/fixtures/', import.meta.url);
export const fixtureUrl = (region) => new URL(`owner-text-${region}.json`, FIXTURE_DIR);

/** Strings later steps may add (spec 4.0 approved list, ES and EN) and the no-JS gate link label. */
export const APPROVED_NEW_TEXT = new Set([
  'Saltar al contenido', 'Skip to content',
  'Ir al pedido', 'Go to order',
  '(se abre en una ventana nueva)', '(opens in a new window)',
]);
/** The no-JS gate link reuses the existing confirm label, so it can appear one more time than in the baseline. */
export const GATE_LABELS = new Set(['Tengo 18 años o más', 'I am 18 or older']);

export async function collectOwnerText(page, region) {
  const raw = await page.evaluate(() => {
    const skip = 'script,style,svg,noscript,template';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(skip) || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const year = String(new Date().getFullYear());
    const textNodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const t = n.nodeValue.trim();
      textNodes.push(n.parentElement.id === 'anio' && t === year ? '{{YEAR}}' : t);
    }
    const attributes = [];
    document.querySelectorAll('[alt],[aria-label]').forEach((el) => {
      if (el.closest('svg')) return;
      ['alt', 'aria-label'].forEach((a) => { if (el.hasAttribute(a) && el.getAttribute(a) !== '') attributes.push({ attr: a, value: el.getAttribute(a) }); });
    });
    const cfg = (window.NAVE_CONFIG && window.NAVE_CONFIG.WHATSAPP) || {};
    return {
      lang: document.documentElement.lang,
      title: document.title,
      metaDescription: document.querySelector('meta[name="description"]').getAttribute('content'),
      textNodes,
      attributes,
      waLinks: [...document.querySelectorAll('[data-wa]')].map((a) => ({ dataWa: a.dataset.wa, href: a.getAttribute('href') })),
      numbers: { pe: String(cfg.pe || '').replace(/\D/g, ''), eu: String(cfg.eu || '').replace(/\D/g, '') },
    };
  });
  const active = raw.numbers[region];
  return {
    region,
    lang: raw.lang,
    title: raw.title,
    metaDescription: raw.metaDescription,
    textNodes: raw.textNodes,
    attributes: raw.attributes,
    waLinks: raw.waLinks.map((l) => ({ dataWa: l.dataWa, href: active ? l.href.replace(`https://wa.me/${active}?`, 'https://wa.me/{{WA}}?') : l.href })),
    whatsappConfigSha256: createHash('sha256').update(JSON.stringify(raw.numbers)).digest('hex'),
  };
}

/** Differences between a fresh collection and the recorded fixture, ignoring only the approved additions. */
export function diffOwnerText(actual, fixture) {
  const diffs = [];
  for (const k of ['region', 'lang', 'title', 'metaDescription', 'whatsappConfigSha256']) {
    if (actual[k] !== fixture[k]) diffs.push(`${k}: expected ${JSON.stringify(fixture[k])}, got ${JSON.stringify(actual[k])}`);
  }
  // text nodes: drop approved new strings, then drop surplus gate-label repeats beyond the baseline count
  const baselineCount = (t) => fixture.textNodes.filter((x) => x === t).length;
  const seen = new Map();
  const text = actual.textNodes.filter((t) => {
    if (APPROVED_NEW_TEXT.has(t) && !fixture.textNodes.includes(t)) return false;
    if (GATE_LABELS.has(t)) {
      seen.set(t, (seen.get(t) ?? 0) + 1);
      return seen.get(t) <= baselineCount(t);
    }
    return true;
  });
  if (JSON.stringify(text) !== JSON.stringify(fixture.textNodes)) {
    const at = fixture.textNodes.findIndex((t, i) => t !== text[i]);
    diffs.push(`textNodes differ at #${at}: expected ${JSON.stringify(fixture.textNodes[at])}, got ${JSON.stringify(text[at])} (counts ${fixture.textNodes.length} vs ${text.length})`);
  }
  if (JSON.stringify(actual.attributes) !== JSON.stringify(fixture.attributes)) diffs.push('alt/aria-label attributes differ');
  if (JSON.stringify(actual.waLinks) !== JSON.stringify(fixture.waLinks)) diffs.push('[data-wa] hrefs differ');
  return diffs;
}

export const readFixture = (region) => JSON.parse(readFileSync(fixtureUrl(region), 'utf8'));
export const writeFixture = (region, data) => writeFileSync(fixtureUrl(region), `${JSON.stringify(data, null, 2)}\n`);
