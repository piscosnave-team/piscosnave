/**
 * @spec-handoff
 * @interface ST-IMG: image markup and extracted asset files (spec 4.5, U-07)
 * @behavior
 *   - hero <img class="h-respaldo">: width=1536 height=1024, srcset with exactly 640w/960w/1536w files under assets/img/,
 *     sizes="(max-width:899px) 92vw, 53vw", fetchpriority="high", never loading="lazy"
 *   - the 3 trio <img class="respaldo"> point to assets/img/trio-{donaire,sunqu,nii}.webp, carry intrinsic width/height equal
 *     to the real file, loading="lazy" and decoding="async"
 *   - every <img> in index.html has positive integer width and height attributes (no layout shift)
 *   - srcset descriptors equal the real pixel width of each file; the derived hero files are smaller than the 1536 original
 *   - hero-1536, trio-* and tex/* are the ORIGINAL bytes: SHA-256 equals tests/static/fixtures/original-assets.json
 *     (decoded from the a20e3de data URIs), so the extraction cannot silently re-encode anything
 * @edge-cases
 *   - a missing file fails with its path (red until E5 creates assets/img/**)
 *   - hero-960 and hero-640 are derived (sharp): only their width and "smaller than the original" are asserted
 * @see ../../.yui-soul/reviews/341-piscosnave-review-340-remediation/spec.md (4.5)
 * @see ./fixtures/original-assets.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { expectedRed } from '../e2e/helpers/expected-red.js';
import { elements } from './helpers/html.js';
import { indexPage, ROOT, sha256Hex } from './helpers/source.js';

const ORIGINALS = JSON.parse(readFileSync(new URL('./fixtures/original-assets.json', import.meta.url), 'utf8'));
const original = (file) => ORIGINALS.files.find((f) => f.file === file);

/** "a.webp 640w, b.webp 960w" -> [{url, w}] */
function parseSrcset(srcset) {
  return String(srcset || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((c) => {
      const [url, desc = ''] = c.split(/\s+/);
      const m = /^(\d+)w$/.exec(desc);
      return { url, w: m ? Number(m[1]) : null };
    });
}

/** Real metadata of a repo file, or null when it does not exist. */
async function fileInfo(rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  const buf = readFileSync(abs);
  const meta = await sharp(buf).metadata();
  return { bytes: buf.length, sha256: sha256Hex(buf), width: meta.width, height: meta.height, format: meta.format };
}

/** Shortens a (possibly base64) attribute value so failure messages stay readable. */
const short = (v) => String(v).slice(0, 80);
const imgs = () => elements(indexPage().tokens, 'img');
const classes = (img) => String(img.attrs.class || '').split(/\s+/);
const heroImg = () => imgs().find((i) => classes(i).includes('h-respaldo'));
const trioImgs = () => imgs().filter((i) => classes(i).includes('respaldo'));

test.describe('ST-IMG image markup and files', () => {
  test('harness: parseSrcset reads width descriptors', async () => {
    expect(parseSrcset('a/b.webp 640w, c.webp 960w ,d.webp 1536w')).toEqual([
      { url: 'a/b.webp', w: 640 },
      { url: 'c.webp', w: 960 },
      { url: 'd.webp', w: 1536 },
    ]);
    expect(parseSrcset('x.webp 2x')[0].w).toBeNull();
    expect(parseSrcset(undefined)).toEqual([]);
  });

  test('the fixture records the 12 original files (1 hero, 3 trio, 8 textures) totalling 979,980 bytes', async () => {
    expect(ORIGINALS.files).toHaveLength(12);
    expect(ORIGINALS.files.reduce((n, f) => n + f.bytes, 0)).toBe(979_980);
    expect(ORIGINALS.files.filter((f) => f.file.startsWith('assets/img/tex/'))).toHaveLength(8);
  });

  test('hero image: intrinsic size, srcset 640w/960w/1536w, sizes, fetchpriority=high, not lazy', async () => {
    expectedRed(test, 'E5', 'the hero <img> is a base64 data URI with no width/height/srcset/sizes/fetchpriority');
    const hero = heroImg();
    expect(hero, 'img.h-respaldo exists').toBeTruthy();
    expect(hero.attrs.width, 'hero width').toBe('1536');
    expect(hero.attrs.height, 'hero height').toBe('1024');
    expect(hero.attrs.sizes, 'hero sizes').toBe('(max-width:899px) 92vw, 53vw');
    expect(hero.attrs.fetchpriority, 'hero fetchpriority').toBe('high');
    expect(hero.attrs.loading, 'the hero is the LCP image and must never be lazy').not.toBe('lazy');
    expect(short(hero.attrs.src), 'hero src is a real file, not a data URI').toMatch(/^assets\/img\/hero-(?:640|960|1536)\.webp$/);
    const candidates = parseSrcset(hero.attrs.srcset);
    expect(candidates.map((c) => c.w), 'srcset widths').toEqual([640, 960, 1536]);
    expect(candidates.map((c) => c.url), 'srcset files').toEqual(['assets/img/hero-640.webp', 'assets/img/hero-960.webp', 'assets/img/hero-1536.webp']);
  });

  test('hero srcset files exist, their pixel widths equal the descriptors and the derived ones are smaller than the original', async () => {
    expectedRed(test, 'E5', 'assets/img/hero-*.webp do not exist yet');
    const sizes = {};
    for (const w of [640, 960, 1536]) {
      const info = await fileInfo(`assets/img/hero-${w}.webp`);
      expect(info, `assets/img/hero-${w}.webp exists`).not.toBeNull();
      expect(info.format, `hero-${w} format`).toBe('webp');
      expect(info.width, `hero-${w} pixel width`).toBe(w);
      expect(info.height, `hero-${w} keeps the 3:2 aspect ratio`).toBe(Math.round((w * 1024) / 1536));
      sizes[w] = info.bytes;
    }
    expect(sizes[640], 'hero-640 is smaller than hero-960').toBeLessThan(sizes[960]);
    expect(sizes[960], 'hero-960 is smaller than hero-1536').toBeLessThan(sizes[1536]);
  });

  test('trio images: files, intrinsic size equal to the file, loading=lazy and decoding=async', async () => {
    expectedRed(test, 'E5', 'the trio <img> are base64 data URIs with no width/height/loading/decoding');
    const trio = trioImgs();
    expect(trio, 'three trio images').toHaveLength(3);
    expect(trio.map((i) => short(i.attrs.src)), 'trio src').toEqual(['assets/img/trio-donaire.webp', 'assets/img/trio-sunqu.webp', 'assets/img/trio-nii.webp']);
    for (const img of trio) {
      const name = short(img.attrs.src);
      const info = await fileInfo(String(img.attrs.src));
      expect(info, `${name} exists`).not.toBeNull();
      expect(img.attrs.width, `${name} width attribute`).toBe(String(info.width));
      expect(img.attrs.height, `${name} height attribute`).toBe(String(info.height));
      expect(img.attrs.loading, `${name} loading`).toBe('lazy');
      expect(img.attrs.decoding, `${name} decoding`).toBe('async');
    }
  });

  test('every <img> declares positive integer width and height', async () => {
    expectedRed(test, 'E5', 'none of the 4 <img> carries width/height today');
    const bad = imgs()
      .filter((i) => !/^[1-9]\d*$/.test(String(i.attrs.width)) || !/^[1-9]\d*$/.test(String(i.attrs.height)))
      .map((i) => `<img class="${i.attrs.class || ''}">`);
    expect(bad, 'images without positive integer width/height').toEqual([]);
  });

  test('original-bytes files (hero-1536, trio, 8 textures) equal the a20e3de data URIs, byte for byte', async () => {
    expectedRed(test, 'E5', 'assets/img/** does not exist yet; the images are still inline base64');
    const wrong = [];
    for (const want of ORIGINALS.files) {
      const info = await fileInfo(want.file);
      if (!info) wrong.push(`${want.file}: missing`);
      else if (info.sha256 !== want.sha256 || info.bytes !== want.bytes) wrong.push(`${want.file}: ${info.bytes} B ${info.sha256.slice(0, 12)} != recorded ${want.bytes} B ${want.sha256.slice(0, 12)}`);
    }
    expect(wrong, 'original-bytes files that are missing or re-encoded').toEqual([]);
    expect(original('assets/img/hero-1536.webp').width).toBe(1536);
  });
});
