/**
 * Per-file project gating. All e2e projects pick up every spec file; a spec that only
 * makes sense in some projects (own viewport, own emulation) calls
 * `runIn(test, 'desktop')` at file level, and the other projects report it as skipped.
 */
export function runIn(test, ...projectNames) {
  test.beforeEach(({}, testInfo) => {
    test.skip(!projectNames.includes(testInfo.project.name), `runs only in: ${projectNames.join(', ')}`);
  });
}
