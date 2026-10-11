/**
 * @spec-handoff
 * @interface ST-HTMLV (I-44): index.html passes html-validate with .htmlvalidate.json
 * @behavior
 *   - validates index.html with html-validate:recommended
 *   - only the two stylistic rules doctype-style and no-inline-style are disabled in .htmlvalidate.json
 * @edge-cases
 *   - a real structural error (duplicate id, bad nesting) must fail the run: the harness test proves the tool is live
 * @see ../../.htmlvalidate.json
 */
import { expect, test } from '@playwright/test';
import { FileSystemConfigLoader, HtmlValidate } from 'html-validate/node';
import { ROOT, readText } from './helpers/source.js';

test.describe('ST-HTMLV html-validate', () => {
  test('harness: the validator is live and reports a duplicate id', async () => {
    const hv = new HtmlValidate({ extends: ['html-validate:recommended'] });
    const report = await hv.validateString('<!doctype html><html lang="en"><head><title>t</title></head><body><p id="a"></p><p id="a"></p></body></html>');
    expect(report.valid).toBe(false);
    expect(report.results[0].messages.map((m) => m.ruleId)).toContain('no-dup-id');
  });

  test('harness: .htmlvalidate.json disables exactly doctype-style and no-inline-style', async () => {
    const config = JSON.parse(readText('.htmlvalidate.json'));
    expect(config.extends).toEqual(['html-validate:recommended']);
    const off = Object.entries(config.rules ?? {}).filter(([, v]) => v === 'off' || v === 0).map(([k]) => k).sort();
    expect(off).toEqual(['doctype-style', 'no-inline-style']);
    expect(Object.keys(config.rules)).toHaveLength(2);
  });

  test('index.html is valid HTML', async () => {
    const hv = new HtmlValidate(new FileSystemConfigLoader());
    const report = await hv.validateFile(`${ROOT}index.html`);
    const messages = report.results.flatMap((r) => r.messages.map((m) => `${m.ruleId} ${m.line}:${m.column} ${m.message}`));
    expect(messages, 'html-validate messages').toEqual([]);
  });
});
