/**
 * @spec-handoff
 * @interface T-OWN: owner-gated byte-identity of everything a visitor can read, per region
 * @behavior
 *   - collects visible text nodes, alt/aria-label values, title, meta description, lang and every [data-wa] href
 *     after JS ran, for ?region=pe and ?region=eu, and compares with tests/static/fixtures/owner-text-{pe,eu}.json
 *   - WhatsApp hrefs are compared with the number replaced by {{WA}}; the configured numbers are compared by SHA-256
 *   - allowed differences: the approved new strings (spec 4.0) and one extra copy of the age-gate confirm label (no-JS link)
 * @edge-cases
 *   - the footer year is normalized to {{YEAR}}
 *   - re-record ONLY on purpose with UPDATE_OWNER_TEXT=1 (owner-approved copy change); never to make a red test green
 *   - fixtures were recorded from the unmodified page (base a20e3de)
 * @see ./helpers/owner-text.js
 * @see ../static/fixtures/owner-text-pe.json
 */
import { runIn } from './helpers/projects.js';
import { diffOwnerText, collectOwnerText, readFixture, writeFixture } from './helpers/owner-text.js';
import { expect, openPage, test } from './helpers/page.js';
import { waitSettled } from './helpers/ready.js';

test.describe('T-OWN owner-gated text is unchanged', () => {
  runIn(test, 'desktop');
  // Text, attributes and links are identical in 3D and static mode; the static path is far cheaper to render.
  test.use({ reducedMotion: 'reduce' });

  for (const region of ['pe', 'eu']) {
    test(`T-OWN rendered text, links and prices are byte-identical (${region})`, async ({ page }) => {
      await openPage(page, { region });
      await waitSettled(page);
      const actual = await collectOwnerText(page, region);
      if (process.env.UPDATE_OWNER_TEXT === '1') {
        writeFixture(region, { recordedFrom: 'a20e3de (unmodified page)', ...actual });
        return;
      }
      expect(diffOwnerText(actual, readFixture(region)), 'differences vs the recorded owner text').toEqual([]);
    });
  }
});
