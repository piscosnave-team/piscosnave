/**
 * @spec-handoff
 * @interface ST-VEND: vendor/ is self-describing and tamper-evident
 * @behavior
 *   - vendor/README.md exists and holds a table with a "file" column (path relative to vendor/) and a "SHA-256" column
 *   - every file under vendor/ except README.md has a row, and its SHA-256 equals the row (LICENSE files included)
 *   - no vendored file matches /gsap|ScrollTrigger/i (GSAP bytes are never committed, D4)
 * @edge-cases
 *   - a table row for a file that does not exist is a violation
 *   - until E5 vendor/ does not exist: the contract test is expected red for exactly that reason
 * @see ../../.yui-soul/reviews/341-piscosnave-review-340-remediation/spec.md (4.5)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { expectedRed } from '../e2e/helpers/expected-red.js';
import { ROOT } from './helpers/source.js';
import { checkVendor } from './helpers/vendor.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');

function fakeRepo(files, tableRows) {
  const root = mkdtempSync(join(tmpdir(), 'nave-vend-'));
  mkdirSync(join(root, 'vendor', 'three'), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'vendor', name), content);
  const table = ['| File | Source URL | Version | SHA-256 | Registry integrity |', '|---|---|---|---|---|', ...tableRows].join('\n');
  writeFileSync(join(root, 'vendor', 'README.md'), `# Vendored\n\n${table}\n`);
  return root;
}

test.describe('ST-VEND vendor checksums', () => {
  test('harness: accepts a consistent vendor tree', async () => {
    const root = fakeRepo({ 'three/a.js': 'AAA', 'three/LICENSE': 'MIT' }, [`| \`three/a.js\` | u | 1 | ${sha('AAA')} | i |`, `| three/LICENSE | u | 1 | ${sha('MIT')} | i |`]);
    try {
      expect(checkVendor(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('harness: detects a tampered file, an unlisted file, a phantom row and GSAP bytes', async () => {
    const root = fakeRepo({ 'three/a.js': 'TAMPERED', 'three/extra.js': 'x', 'gsap.min.js': 'g' }, [`| three/a.js | u | 1 | ${sha('AAA')} | i |`, `| three/ghost.js | u | 1 | ${sha('g')} | i |`]);
    try {
      const v = checkVendor(root).join('\n');
      expect(v).toContain('three/a.js SHA-256 differs');
      expect(v).toContain('three/extra.js has no row');
      expect(v).toContain('three/ghost.js, which does not exist');
      expect(v).toContain('GSAP bytes must never be committed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('vendor/ in the repository is complete and every checksum matches', async () => {
    expectedRed(test, 'E5', 'vendor/ and vendor/README.md do not exist until E5 vendors three.module.min.js');
    expect(checkVendor(ROOT), 'vendor violations').toEqual([]);
  });
});
