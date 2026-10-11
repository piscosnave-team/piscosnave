/**
 * @spec-handoff
 * @interface harness self-checks for the e2e helpers (axe filtering, readiness, settle) + an opt-in axe probe
 * @behavior
 *   - the axe helper reports a real serious/critical violation on a synthetic page and honours a baseline entry
 *   - waitReady/waitSettled/getModo resolve on the served page
 *   - AXE_PROBE=1 prints the settled axe numbers per project (informational, asserts nothing)
 * @edge-cases
 *   - baseline entries need an owning finding id (checked statically in tests/static/owner-fixtures.spec.js)
 * @see ./helpers/axe.js
 * @see ./helpers/ready.js
 */
import { newViolations, scanEach, scanRaw, scanSections } from './helpers/axe.js';
import { expect, openPage, test } from './helpers/page.js';
import { getModo, waitSettled } from './helpers/ready.js';

test.describe('e2e harness', () => {
  test('axe helper finds a critical violation on a synthetic page and honours the baseline', async ({ page }) => {
    await page.setContent('<!doctype html><html lang="en"><head><title>t</title></head><body><main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>');
    const raw = await scanRaw(page);
    const found = newViolations(raw, {}, 'desktop');
    expect(found.map((v) => `${v.rule}:${v.impact}`)).toContain('image-alt:critical');
    const target = found.find((v) => v.rule === 'image-alt').target;
    expect(newViolations(raw, { 'image-alt': [{ target, finding: 'I-00' }] }, 'desktop').map((v) => v.rule)).not.toContain('image-alt');
    expect(newViolations(raw, { 'image-alt': [{ target, finding: 'I-00', projects: ['mobile-375'] }] }, 'desktop').map((v) => v.rule)).toContain('image-alt');
  });

  // Runs in every project: proves the readiness/settle helpers work with each emulation (and gives the
  // reduced-motion and landscape projects a real test before their own specs land in E7/E9).
  test('readiness and settle resolve on the served page', async ({ page }, testInfo) => {
    await openPage(page);
    await waitSettled(page);
    const modo = await getModo(page);
    expect(['3d', 'estatica']).toContain(modo);
    // reduced motion is static by design, before and after E7
    if (testInfo.project.name === 'reduced-motion') expect(modo).toBe('estatica');
  });
});

test.describe('axe probe (opt-in)', () => {
  test('AXE_PROBE settled numbers on the page as served', async ({ page }, testInfo) => {
    test.skip(!process.env.AXE_PROBE, 'set AXE_PROBE=1 to print the settled axe numbers');
    test.setTimeout(300_000); // six axe passes over a software-rendered 3D page
    await openPage(page);
    await waitSettled(page);
    const whole = newViolations(await scanRaw(page), {}, testInfo.project.name);
    const sections = [
      ...(await scanSections(page, testInfo.project.name, ['#inicio', 'footer.pie'], {})),
      ...(await scanEach(page, testInfo.project.name, '[data-r]', {})),
    ];
    console.log(`AXE_PROBE ${testInfo.project.name} whole-page serious/critical nodes: ${whole.length}`);
    for (const v of whole) console.log(`  whole  ${v.rule} (${v.impact}) ${v.target}`);
    console.log(`AXE_PROBE ${testInfo.project.name} per-section serious/critical nodes: ${sections.length}`);
    for (const v of sections) console.log(`  section ${v.rule} (${v.impact}) ${v.target}`);
  });
});
