import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { sha256Hex } from './source.js';

/**
 * Rows of the table in vendor/README.md. The table is located by its header cells: a column whose
 * header contains "file" and one containing "sha-256"/"sha256". The file cell is a path relative to
 * vendor/ (a leading "vendor/" is tolerated); backticks are stripped.
 */
export function parseVendorTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const header = cells(lines[i]).map((h) => h.toLowerCase());
    const fileCol = header.findIndex((h) => h.includes('file'));
    const shaCol = header.findIndex((h) => /sha-?256/.test(h));
    if (fileCol === -1 || shaCol === -1) continue;
    for (let k = i + 2; k < lines.length && /^\s*\|/.test(lines[k]); k += 1) {
      const c = cells(lines[k]);
      rows.push({
        file: c[fileCol].replace(/`/g, '').replace(/^vendor\//, ''),
        sha256: c[shaCol].replace(/`/g, '').toLowerCase(),
      });
    }
    break;
  }
  return rows;
}

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * ST-VEND over a repository root: vendor/README.md exists, every vendored file except the README has a row
 * and a matching SHA-256, and no vendored file looks like GSAP (its licence is an open owner question, D4).
 * @returns {string[]} violations
 */
export function checkVendor(root) {
  const dir = join(root, 'vendor');
  const readme = join(dir, 'README.md');
  if (!existsSync(readme)) return ['vendor/README.md does not exist (created by E5 together with vendor/three/)'];
  const rows = parseVendorTable(readFileSync(readme, 'utf8'));
  const v = [];
  if (rows.length === 0) v.push('vendor/README.md has no table with "file" and "SHA-256" columns');
  const files = listFiles(dir)
    .map((f) => relative(dir, f).split(sep).join('/'))
    .filter((f) => f !== 'README.md');
  if (files.length === 0) v.push('vendor/ contains no vendored files besides README.md');
  for (const f of files) {
    if (/gsap|scrolltrigger/i.test(f)) v.push(`GSAP bytes must never be committed: vendor/${f}`);
    const row = rows.find((r) => r.file === f);
    if (!row) v.push(`vendor/${f} has no row in vendor/README.md`);
    else if (row.sha256 !== sha256Hex(readFileSync(join(dir, f)))) v.push(`vendor/${f} SHA-256 differs from vendor/README.md`);
  }
  for (const r of rows) if (!files.includes(r.file)) v.push(`vendor/README.md lists vendor/${r.file}, which does not exist`);
  return v;
}
