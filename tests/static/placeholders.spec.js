/**
 * @spec-handoff
 * @interface ST-PLH (I-40, D9): legal-placeholder guard, WARN mode by default
 * @behavior
 *   - reports every bracketed template token ([NIF], [Nombre o razón social], [email]...) found in
 *     index.html markup (text, alt, aria-label, title, meta content) and in page code (index.html scripts, js/**)
 *   - passes in warn mode; fails only when PLACEHOLDER_GUARD=block (single documented switch)
 *   - prints a GitHub ::warning:: line when GITHUB_ACTIONS is set
 * @edge-cases
 *   - code is scanned inside string literals only (JS[actual][k] and selectors like '[alt]' are not placeholders)
 *   - the owner supplies the legal data (U-02); until then the live placeholders are expected warnings
 * @see ./helpers/placeholders.js
 */
import { expect, test } from '@playwright/test';
import { lineOf } from './helpers/html.js';
import { evaluateGuard, guardMode, scanCode, scanMarkup } from './helpers/placeholders.js';
import { codeSources, indexPage } from './helpers/source.js';

function collect() {
  const { html, tokens } = indexPage();
  const items = [];
  for (const t of tokens) {
    if (t.type === 'text' && !t.raw && t.ancestors.includes('body')) items.push({ text: t.text, line: lineOf(html, t.index) });
    if (t.type === 'text' && t.raw && t.ancestors.at(-1) === 'title') items.push({ text: t.text, line: lineOf(html, t.index) });
    if (t.type === 'start') for (const a of ['alt', 'aria-label', 'title', 'content']) if (typeof t.attrs[a] === 'string') items.push({ text: t.attrs[a], line: lineOf(html, t.index) });
  }
  const found = scanMarkup('index.html', items);
  for (const s of codeSources()) found.push(...scanCode(s.file, s.text, s.line));
  return found;
}

test.describe('ST-PLH legal placeholder guard', () => {
  test('harness: detector finds placeholders in markup and code, and ignores selectors and indexing', async () => {
    expect(scanMarkup('x', [{ text: 'Titular: [Nombre o razón social] · NIF: [NIF]', line: 1 }]).map((m) => m.token)).toEqual(['[Nombre o razón social]', '[NIF]']);
    expect(scanCode('x', `const a = "Contact: [correo electrónico]."; JS[actual][k]; q('[alt],[aria-label]')`).map((m) => m.token)).toEqual(['[correo electrónico]']);
    expect(scanCode('x', 'const h = `<svg>${tipos[tipo](id)}</svg> [NIF]`;').map((m) => m.token)).toEqual(['[NIF]']);
  });

  test('harness: block mode fails on any match, warn mode never fails', async () => {
    const m = [{ where: 'x', line: 1, token: '[NIF]' }];
    expect(evaluateGuard(m, 'block').fail).toBe(true);
    expect(evaluateGuard(m, 'warn').fail).toBe(false);
    expect(evaluateGuard([], 'block').fail).toBe(false);
    expect(guardMode({ PLACEHOLDER_GUARD: 'block' })).toBe('block');
    expect(guardMode({})).toBe('warn');
  });

  test('legal placeholders are reported (warn) and fail only when PLACEHOLDER_GUARD=block', async () => {
    const matches = collect();
    const mode = guardMode();
    const { fail, summary } = evaluateGuard(matches, mode);
    if (matches.length) {
      for (const m of matches) console.warn(`placeholder ${m.token} at ${m.where}:${m.line}`);
      if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Legal placeholders (${mode} mode)::${summary}`);
      test.info().annotations.push({ type: 'warning', description: summary });
    }
    expect(fail, `PLACEHOLDER_GUARD=block: ${summary}`).toBe(false);
  });
});
