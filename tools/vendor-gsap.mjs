#!/usr/bin/env node
/**
 * Owner-only GSAP self-hosting helper. This script never runs in CI.
 *
 * GSAP's commercial-use licence is an owner decision. Do not run this until the
 * owner has approved self-hosting and redistribution for this site.
 *
 * Usage: node tools/vendor-gsap.mjs --write
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const files = [
  {
    name: 'gsap.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
    sri: 'sha512-7eHRwcbYkK4d9g/6tD/mhkf++eoTHwpNM9woBxtPUBWm67zeAfFC+HrdoE2GanKeocly/VxeLvIqwvCdk7qScg==',
  },
  {
    name: 'ScrollTrigger.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
    sri: 'sha512-onMTRKJBKz8M1TnqqDuGBlowlH0ohFzMXYRNebz+yOcc5TQr/zAKsthzhuv0hiyUKEiQEQXEynnXCvNTOk50dg==',
  },
];

if (process.argv.includes('--help')) {
  console.log('Usage: node tools/vendor-gsap.mjs --write');
  process.exit(0);
}
if (!process.argv.includes('--write')) {
  throw new Error('Refusing to download GSAP without --write. Confirm the owner-approved licence decision first.');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'vendor', 'gsap');
const downloads = await Promise.all(files.map(async (file) => {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Download failed for ${file.name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sri = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (sri !== file.sri) throw new Error(`SRI mismatch for ${file.name}; nothing was written.`);
  return { ...file, bytes };
}));

mkdirSync(outputDir, { recursive: true });
for (const file of downloads) writeFileSync(resolve(outputDir, file.name), file.bytes);

console.log(`Verified and wrote ${downloads.length} GSAP files to ${outputDir}. This path is gitignored.`);
console.log('After the owner approves the licence, replace the two CDN tags with:');
for (const file of downloads) console.log(`<script defer src="vendor/gsap/${file.name}"></script>`);
console.log("Then remove https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ from script-src and run npm run csp -- --check.");
