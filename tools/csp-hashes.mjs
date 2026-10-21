#!/usr/bin/env node
/**
 * Rebuild or verify the CSP hashes for executable inline scripts in index.html.
 *
 * Usage:
 *   npm run csp          # rewrite the CSP meta when hashes changed
 *   npm run csp -- --check  # fail if index.html needs regeneration
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, 'index.html');
const checkOnly = process.argv.slice(2).includes('--check');

function isExecutable(type) {
  return type === '' || !/(^|\/|\+)json$|^text\/(plain|template)$/.test(type);
}

function inlineScriptHashes(html) {
  const hashes = [];
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    const attrs = match[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2].toLowerCase() ?? '';
    if (!isExecutable(type)) continue;
    hashes.push(`'sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}'`);
  }
  return hashes;
}

const html = readFileSync(indexPath, 'utf8');
const hashes = inlineScriptHashes(html);
if (hashes.length === 0) throw new Error('No executable inline scripts found in index.html.');

const policy = `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`;
// The page uses a double-quoted content attribute because CSP source expressions use single quotes.
const cspPattern = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(">)/i;
if (!cspPattern.test(html)) throw new Error('Could not find the Content-Security-Policy meta tag in index.html.');
const updated = html.replace(cspPattern, `$1${policy}$2`);

if (checkOnly) {
  if (updated !== html) {
    console.error('CSP hashes are stale. Run npm run csp.');
    process.exit(1);
  }
  console.log(`CSP hashes are current (${hashes.length} executable inline script blocks).`);
} else if (updated !== html) {
  writeFileSync(indexPath, updated);
  console.log(`Updated CSP hashes for ${hashes.length} executable inline script blocks.`);
} else {
  console.log(`CSP hashes already current (${hashes.length} executable inline script blocks).`);
}
