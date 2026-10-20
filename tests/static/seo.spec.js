/**
 * @spec-handoff
 * @interface ST-SEO: index.html head metadata and static SEO assets derive URLs from package.json homepage
 * @behavior
 *   - Publishes the existing description plus canonical, Open Graph and Twitter-card metadata for the project-site URL
 *   - Publishes an absolute 1200x630 OG image, static favicon links, theme color, and safe Organization JSON-LD
 *   - Keeps robots.txt and sitemap.xml on the same base URL without adding hreflang or owner-gated identity data
 * @edge-cases
 *   - JSON-LD is a data block, so it must not add a CSP script hash
 *   - Icons and OG assets must exist with their declared intrinsic dimensions
 * @see ../../.yui-soul/reviews/341-piscosnave-review-340-remediation/spec.md (4.8)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { elements, inlineScripts } from './helpers/html.js';
import { indexPage, ROOT } from './helpers/source.js';

const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const BASE_URL = PACKAGE.homepage;
const OG_IMAGE_PATH = 'assets/og/nave-og-1200x630.jpg';
const ICONS = [
  ['assets/icons/favicon.svg', undefined],
  ['assets/icons/favicon-32x32.png', { width: 32, height: 32 }],
  ['assets/icons/apple-touch-icon.png', { width: 180, height: 180 }],
];
const FORBIDDEN_JSON_LD_KEY = /^(legalname|taxid|address|email|telephone|offers)$|price/i;

function headElements(name) {
  return elements(indexPage().tokens, name).filter((element) => element.ancestors.includes('head'));
}

function meta(property, value) {
  return headElements('meta').find((element) => element.attrs[property] === value);
}

function link(rel, href) {
  return headElements('link').find((element) => element.attrs.rel === rel && element.attrs.href === href);
}

function keysDeep(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => keysDeep(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      keysDeep(child, found);
    }
  }
  return found;
}

test.describe('ST-SEO head metadata and static assets', () => {
  test('the package homepage is the trailing-slash project-site base URL shared by robots and sitemap', async () => {
    expect(BASE_URL).toBe('https://omnix-afk.github.io/piscosnave/');
    expect(readFileSync(join(ROOT, 'robots.txt'), 'utf8')).toContain(`Sitemap: ${BASE_URL}sitemap.xml`);
    expect(readFileSync(join(ROOT, 'sitemap.xml'), 'utf8')).toContain(`<loc>${BASE_URL}</loc>`);
  });

  test('share metadata reuses the existing title and description and pins all SEO URLs to the package homepage', async () => {
    const title = indexPage().tokens.find((element) => element.type === 'text' && element.ancestors.at(-1) === 'title')?.text;
    const description = meta('name', 'description')?.attrs.content;
    const ogImage = `${BASE_URL}${OG_IMAGE_PATH}`;
    expect(meta('property', 'og:title')?.attrs.content).toBe(title);
    expect(meta('property', 'og:description')?.attrs.content).toBe(description);
    expect(meta('property', 'og:type')?.attrs.content).toBe('website');
    expect(meta('property', 'og:url')?.attrs.content).toBe(BASE_URL);
    expect(meta('property', 'og:image')?.attrs.content).toBe(ogImage);
    expect(meta('property', 'og:image:width')?.attrs.content).toBe('1200');
    expect(meta('property', 'og:image:height')?.attrs.content).toBe('630');
    expect(meta('property', 'og:image:alt')?.attrs.content).toBeTruthy();
    expect(meta('name', 'twitter:card')?.attrs.content).toBe('summary_large_image');
    expect(link('canonical', BASE_URL)).toBeTruthy();
  });

  test('the OG share image and static icon files exist at their declared intrinsic sizes', async () => {
    expect(existsSync(join(ROOT, OG_IMAGE_PATH)), `${OG_IMAGE_PATH} exists`).toBe(true);
    await expect(sharp(join(ROOT, OG_IMAGE_PATH)).metadata()).resolves.toMatchObject({ width: 1200, height: 630 });
    for (const [path, dimensions] of ICONS) {
      expect(existsSync(join(ROOT, path)), `${path} exists`).toBe(true);
      if (dimensions) await expect(sharp(join(ROOT, path)).metadata()).resolves.toMatchObject(dimensions);
    }
  });

  test('the static SVG, PNG fallback, and Apple-touch icon replace the favicon data URI', async () => {
    expect(link('icon', 'assets/icons/favicon.svg')?.attrs.type).toBe('image/svg+xml');
    expect(link('icon', 'assets/icons/favicon-32x32.png')).toMatchObject({ attrs: { sizes: '32x32', type: 'image/png' } });
    expect(link('apple-touch-icon', 'assets/icons/apple-touch-icon.png')).toMatchObject({ attrs: { sizes: '180x180' } });
  });

  test('the theme color stays declared and document language has no owner-gated alternate hreflang', async () => {
    expect(meta('name', 'theme-color')?.attrs.content).toBe('#572333');
    expect(indexPage().tokens.find((element) => element.type === 'start' && element.name === 'html')?.attrs.lang).toBe('es');
    expect(headElements('link').filter((element) => element.attrs.rel === 'alternate' && element.attrs.hreflang !== undefined)).toEqual([]);
  });

  test('Organization JSON-LD is parseable, base-URL scoped, and excludes owner-gated identity and price data', async () => {
    const block = inlineScripts(indexPage().tokens).find((script) => script.type === 'application/ld+json');
    expect(block, 'one JSON-LD data block').toBeTruthy();
    const jsonLd = JSON.parse(block.text);
    expect(jsonLd['@type']).toBe('Organization');
    expect(jsonLd.name).toBe('NAVE');
    expect(jsonLd.url).toBe(BASE_URL);
    expect(jsonLd.logo).toMatch(new RegExp(`^${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}assets/icons/`));
    expect(keysDeep(jsonLd).filter((key) => FORBIDDEN_JSON_LD_KEY.test(key))).toEqual([]);
  });
});
