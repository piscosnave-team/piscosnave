/**
 * @spec-handoff
 * @interface TC15 guard: the WhatsApp number exists only in index.html
 * @behavior
 *   - reads the configured number(s) from the page at runtime (never hard-coded here)
 *   - no other text file in the repository (tests, docs, workflow, js/**, fixtures, lockfile...) contains them
 *   - the T-OWN fixtures hold the number only as the {{WA}} token
 * @edge-cases
 *   - node_modules, .git and test outputs are skipped; binary assets are skipped by extension
 *   - after the layout-C move the number stays in the index.html JSON config block, so js/** must not receive it
 * @see ../../.yui-soul/reviews/341-piscosnave-review-340-remediation/spec.md (TC15)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { ROOT, loadConfig } from './helpers/source.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'blob-report']);
const TEXT_EXT = /\.(?:js|mjs|cjs|json|md|html|xml|txt|ya?ml|css|svg|toml|cfg|editorconfig|gitignore)$|^[^.]*$/;

function textFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) textFiles(full, out);
    else if (TEXT_EXT.test(name) || name.startsWith('.')) out.push(full);
  }
  return out;
}

test('the WhatsApp number does not appear in any file other than index.html', async () => {
  const config = loadConfig();
  const numbers = [...new Set(Object.values(config.WHATSAPP).map((n) => String(n).replace(/\D/g, '')).filter((n) => n.length >= 8))];
  expect(numbers.length, 'no WhatsApp number found in the page config').toBeGreaterThan(0);
  const offenders = [];
  for (const file of textFiles(ROOT)) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (rel === 'index.html') continue;
    const text = readFileSync(file, 'utf8');
    const digits = text.replace(/[\s+()-]/g, '');
    if (numbers.some((n) => text.includes(n) || digits.includes(n))) offenders.push(rel);
  }
  expect(offenders, 'files that copy the WhatsApp number (the PR promises not to)').toEqual([]);
});
