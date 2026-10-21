#!/usr/bin/env node
/**
 * One-off asset extraction, kept as provenance (plan 341, E5; spec 4.5).
 *
 * Decodes the base64 WebP data URIs of the pre-refactor page (`index.html` at commit a20e3de) into real files:
 *   assets/img/hero-1536.webp            original bytes (hero, 1536x1024)
 *   assets/img/trio-{donaire,sunqu,nii}.webp   original bytes
 *   assets/img/tex/<key>.webp            original bytes, one per key of the old `texturas` JSON block
 * and derives two smaller hero sizes with sharp (the only re-encoded files):
 *   assets/img/hero-960.webp, assets/img/hero-640.webp
 *
 * Usage (from the repository root):
 *   node tools/extract-assets.mjs            write the files (idempotent: unchanged files are left alone)
 *   node tools/extract-assets.mjs --verify   write nothing; prove every original-bytes file hashes equal to its
 *                                            decoded data URI and that the derived files exist with the right width
 *
 * Exit code 0 on success, 1 on any mismatch.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SOURCE_REV = 'a20e3de';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = 'assets/img';

/** Hero derivatives: width -> WebP quality (recorded in assets/PROVENANCE.md). */
const HERO_QUALITY = 80;
const HERO_WIDTHS = [960, 640];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const DATA_URI = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/;

function decode(uri, what) {
  const m = DATA_URI.exec(uri);
  if (!m) throw new Error(`${what}: not a data:image/webp;base64 URI`);
  return Buffer.from(m[1], 'base64');
}

/** Original-bytes files decoded from the source revision: [{ file, bytes }]. */
function originals() {
  const html = execFileSync('git', ['show', `${SOURCE_REV}:index.html`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = [];

  const hero = /<img class="h-respaldo" src="(data:image\/webp;base64,[^"]+)"/.exec(html);
  if (!hero) throw new Error('hero <img class="h-respaldo"> with a data URI not found in the source revision');
  out.push({ file: `${IMG}/hero-1536.webp`, bytes: decode(hero[1], 'hero') });

  const trio = [...html.matchAll(/data-arco="(donaire|sunqu|nii)"><img class="respaldo" src="(data:image\/webp;base64,[^"]+)"/g)];
  if (trio.length !== 3) throw new Error(`expected 3 trio images in the source revision, found ${trio.length}`);
  for (const [, name, uri] of trio) out.push({ file: `${IMG}/trio-${name}.webp`, bytes: decode(uri, `trio ${name}`) });

  const block = /<script id="texturas" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!block) throw new Error('texturas JSON block not found in the source revision');
  const textures = Object.entries(JSON.parse(block[1]));
  if (textures.length !== 8) throw new Error(`expected 8 textures in the source revision, found ${textures.length}`);
  for (const [key, uri] of textures) {
    if (!/^[\w-]+$/.test(key)) throw new Error(`unsafe texture key: ${key}`);
    out.push({ file: `${IMG}/tex/${key}.webp`, bytes: decode(uri, `texture ${key}`) });
  }
  return out;
}

/** Derived hero sizes from the original hero bytes. sharp writes no EXIF/XMP/ICC unless asked. */
async function derivatives(heroBytes) {
  const out = [];
  for (const width of HERO_WIDTHS) {
    const bytes = await sharp(heroBytes).resize({ width }).webp({ quality: HERO_QUALITY, effort: 6 }).toBuffer();
    out.push({ file: `${IMG}/hero-${width}.webp`, bytes });
  }
  return out;
}

function writeIfChanged(file, bytes) {
  const abs = join(ROOT, file);
  if (existsSync(abs) && readFileSync(abs).equals(bytes)) return 'unchanged';
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  return 'written';
}

async function main() {
  const verify = process.argv.includes('--verify');
  const decoded = originals();
  const derived = await derivatives(decoded[0].bytes);
  let failures = 0;

  for (const { file, bytes } of decoded) {
    const want = sha256(bytes);
    if (verify) {
      const abs = join(ROOT, file);
      const have = existsSync(abs) ? sha256(readFileSync(abs)) : 'missing';
      const ok = have === want;
      if (!ok) failures += 1;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${file} ${bytes.length} B sha256 ${want}${ok ? '' : ` (file: ${have})`}`);
    } else {
      console.log(`${writeIfChanged(file, bytes).padEnd(9)} ${file} ${bytes.length} B sha256 ${want}`);
    }
  }

  for (const { file, bytes } of derived) {
    const width = Number(/hero-(\d+)\.webp$/.exec(file)[1]);
    if (verify) {
      const abs = join(ROOT, file);
      const meta = existsSync(abs) ? await sharp(readFileSync(abs)).metadata() : null;
      const ok = meta !== null && meta.format === 'webp' && meta.width === width;
      if (!ok) failures += 1;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${file} derived, width ${meta ? meta.width : 'missing'} (want ${width})`);
    } else {
      console.log(`${writeIfChanged(file, bytes).padEnd(9)} ${file} ${bytes.length} B sha256 ${sha256(bytes)} (derived, q${HERO_QUALITY})`);
    }
  }

  const total = decoded.reduce((n, f) => n + f.bytes.length, 0);
  console.log(`${decoded.length} original-bytes files, ${total} B decoded from ${SOURCE_REV}:index.html`);
  if (failures > 0) {
    console.error(`${failures} verification failure(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
