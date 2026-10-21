/**
 * Settled axe scan (I-42, spec 4.3 S8). Tags: wcag2a, wcag2aa, wcag22aa. Fails on serious/critical violations
 * that are not in tests/a11y-baseline.json.
 *
 * Baseline format (committed; starts as {}):
 *   { "<axe rule id>": [ { "target": "<axe node target joined by ' '>", "finding": "I-07", "projects": ["desktop"] } ] }
 * `finding` (an I-NN / U-NN report id) is required on every entry; `projects` is optional (default: all).
 */
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { scrollIntoViewSettled } from './scroll.js';
import { waitSettled } from './ready.js';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];
export const BLOCKING_IMPACTS = ['serious', 'critical'];

export const loadBaseline = () => JSON.parse(readFileSync(new URL('../../a11y-baseline.json', import.meta.url), 'utf8'));

/** Problems with the baseline file itself (entries without an owning finding id, wrong shape). */
export function baselineProblems(baseline) {
  const problems = [];
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return ['baseline must be a JSON object'];
  for (const [rule, entries] of Object.entries(baseline)) {
    if (!Array.isArray(entries)) { problems.push(`${rule}: must be an array`); continue; }
    entries.forEach((e, i) => {
      if (typeof e.target !== 'string' || !e.target) problems.push(`${rule}[${i}]: missing target`);
      if (!/^(I|U)-\d+$/.test(e.finding ?? '')) problems.push(`${rule}[${i}]: missing owning finding id (I-NN or U-NN)`);
    });
  }
  return problems;
}

/** serious/critical nodes not covered by the baseline, as flat records. */
export function newViolations(violations, baseline, project) {
  const out = [];
  for (const v of violations) {
    if (!BLOCKING_IMPACTS.includes(v.impact)) continue;
    const known = baseline[v.id] ?? [];
    for (const node of v.nodes) {
      const target = node.target.flat().join(' ');
      const covered = known.some((k) => k.target === target && (!k.projects || k.projects.includes(project)));
      if (!covered) out.push({ rule: v.id, impact: v.impact, target, help: v.help });
    }
  }
  return out;
}

const builder = (page) => new AxeBuilder({ page }).withTags(AXE_TAGS);

/** Raw axe violations of whatever is loaded (no readiness wait; for synthetic pages and probes). */
export async function scanRaw(page) {
  return (await builder(page).analyze()).violations;
}

/** Whole-page scan in the current (settled) state. */
export async function scanPage(page, project, baseline = loadBaseline()) {
  await waitSettled(page);
  return newViolations(await scanRaw(page), baseline, project);
}

/** Scrolls each selector into view, settles, scans only that subtree (I-42: scan after scrolling each target into view). */
export async function scanSections(page, project, selectors, baseline = loadBaseline()) {
  const found = [];
  for (const selector of selectors) {
    await scrollIntoViewSettled(page, selector);
    found.push(...newViolations((await builder(page).include(selector).analyze()).violations, baseline, project));
  }
  return found;
}

/**
 * Like scanSections, but for every element matching `selector` on its own (e.g. each [data-r] reveal item):
 * a tall section cannot have all of its children mid-hold at once, so scanning the section as a whole at one
 * scroll position reports transient low-contrast frames of the children that are fading in or out.
 */
export async function scanEach(page, project, selector, baseline = loadBaseline()) {
  const count = await page.locator(selector).count();
  const found = [];
  for (let i = 0; i < count; i += 1) {
    const handle = page.locator(selector).nth(i);
    await handle.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await waitSettled(page);
    // unique structural CSS path (no DOM mutation): axe's include() takes selectors, not handles
    const path = await handle.evaluate((el) => {
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
        parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${[...n.parentElement.children].indexOf(n) + 1})`);
      }
      return `html > ${parts.join(' > ')}`;
    });
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).include(path).analyze();
    found.push(...newViolations(result.violations, baseline, project));
  }
  return found;
}
