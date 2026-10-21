/**
 * Source loading for the static layer: index.html, the code that may live in js/**,
 * and the page's data (NAVE_CONFIG, the i18n dictionaries) extracted WITHOUT a browser.
 *
 * Layout-agnostic on purpose: before E5 the code is inline in index.html; after the layout-C
 * move it lives in js/app.js and js/escena.js. Every loader below looks in both places.
 * Contract for implementers (E5): the dictionary literals (`const PE = {`, `const EU = {`,
 * `const JS = {`) and the config must stay evaluable in the small sandbox used by
 * `evalLiteral` (globals: window.NAVE_CONFIG, NAVE_CONFIG, PRECIOS). If a later step needs more
 * in scope, extend `evalLiteral` here rather than weakening the specs that call it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { inlineScripts, isExecutableScript, lineOf, tokenize } from './html.js';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');
export const sha256Base64 = (buf) => createHash('sha256').update(buf).digest('base64');

export const fileExists = (rel) => existsSync(join(ROOT, rel));
export const readText = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let cache = null;
/** index.html source, its tokens and inline scripts, parsed once per worker. */
export function indexPage() {
  if (!cache) {
    const html = readText('index.html');
    const tokens = tokenize(html);
    cache = { html, tokens, scripts: inlineScripts(tokens) };
  }
  return cache;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Relative paths of js/**\/*.js (empty before E5). */
export function jsFiles() {
  const dir = join(ROOT, 'js');
  if (!existsSync(dir)) return [];
  return walk(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => relative(ROOT, f).split(sep).join('/'))
    .sort();
}

/**
 * Every piece of executable page code with its origin: executable inline scripts of index.html
 * (not JSON data blocks) plus js/**. `line` is the 1-based line of the first character of `text`.
 */
export function codeSources() {
  const { html, scripts } = indexPage();
  const sources = scripts
    .filter(isExecutableScript)
    .map((s) => ({ file: 'index.html', text: s.text, line: lineOf(html, s.index) }));
  for (const f of jsFiles()) sources.push({ file: f, text: readText(f), line: 1 });
  return sources;
}

/* ---------- balanced literal extraction ---------- */

function skipString(src, i) {
  const q = src[i];
  let k = i + 1;
  while (k < src.length) {
    const c = src[k];
    if (c === '\\') k += 2;
    else if (c === q) return k + 1;
    else if (q === '`' && c === '$' && src[k + 1] === '{') k = skipBraces(src, k + 1);
    else k += 1;
  }
  return src.length;
}

/** `i` points at "{"; returns the index just after the matching "}". */
function skipBraces(src, i) {
  let depth = 0;
  let k = i;
  while (k < src.length) {
    const c = src[k];
    if (c === '"' || c === "'" || c === '`') k = skipString(src, k);
    else if (c === '/' && src[k + 1] === '/') k = src.indexOf('\n', k) === -1 ? src.length : src.indexOf('\n', k);
    else if (c === '/' && src[k + 1] === '*') k = src.indexOf('*/', k) === -1 ? src.length : src.indexOf('*/', k) + 2;
    else {
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) return k + 1;
      }
      k += 1;
    }
  }
  throw new Error('unbalanced braces while extracting a literal');
}

/**
 * Finds `<declaration> {...}` and returns the object-literal text.
 * @param {string} src @param {RegExp} declaration  must match up to right before the "{" (declaration of the const PE kind)
 */
export function extractObjectLiteral(src, declaration) {
  const m = declaration.exec(src);
  if (!m) return null;
  const open = m.index + m[0].length;
  if (src[open] !== '{') return null;
  return src.slice(open, skipBraces(src, open));
}

/** Evaluates an object literal in an empty sandbox that only knows the page config. */
export function evalLiteral(literal, config = null) {
  const sandbox = { window: { NAVE_CONFIG: config }, NAVE_CONFIG: config, PRECIOS: config ? config.PRECIOS : undefined };
  return vm.runInNewContext(`(${literal})`, sandbox, { timeout: 1000 });
}

/**
 * window.NAVE_CONFIG: from a `<script type="application/json" id="nave-config">` block when it exists
 * (layout C, spec 4.0), otherwise from the `window.NAVE_CONFIG = {...}` assignment in the code.
 * Returns null when neither exists.
 */
export function loadConfig() {
  const { scripts } = indexPage();
  const block = scripts.find((s) => s.id === 'nave-config');
  if (block) return JSON.parse(block.text);
  for (const s of codeSources()) {
    const literal = extractObjectLiteral(s.text, /window\.NAVE_CONFIG\s*=\s*/);
    if (literal) return evalLiteral(literal);
  }
  return null;
}

/** { PE, EU, JS:{pe,eu} } evaluated from the code; any missing entry is null. */
export function loadDictionaries() {
  const config = loadConfig();
  const found = { PE: null, EU: null, JS: null };
  for (const s of codeSources()) {
    for (const name of Object.keys(found)) {
      if (found[name]) continue;
      const literal = extractObjectLiteral(s.text, new RegExp(`\\bconst\\s+${name}\\s*=\\s*`));
      if (literal) found[name] = evalLiteral(literal, config);
    }
  }
  return found;
}
