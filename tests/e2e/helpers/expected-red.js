/**
 * Expected-red marker (spec 4.11, red-first rule).
 *
 * A guard written BEFORE the behaviour it protects exists is marked with
 * `expectedRed(test, 'E5', 'why it is red today')` as the first statement of the
 * test body. While the marker is active Playwright's `test.fail()` makes the run
 * green only if the test really fails; the day the behaviour lands the test
 * "unexpectedly passes" and the run turns red, which forces the owning step to
 * delete the marker line. After E12 no marker may remain: `grep -rn "expectedRed(" tests`.
 *
 * `SHOW_RED=1 npx playwright test ...` disables every marker so the real failure
 * message (the reason it is red) can be read.
 */
export function expectedRed(test, clearedByStep, reason) {
  if (!/^E\d{1,2}$/.test(clearedByStep)) {
    throw new Error(`expectedRed: first argument must name the step that clears it (e.g. "E5"), got ${clearedByStep}`);
  }
  test.fail(!process.env.SHOW_RED, `expected red until ${clearedByStep}: ${reason}`);
}
