/**
 * Shared fixture constants (I-41): every browser context is pinned to the same
 * timezone, locale and region, so results never depend on the machine running them.
 * The page picks its default region from the timezone (America/* -> PE), so the
 * pins matter: a UTC runner would otherwise get EU prices.
 */
export const PORT = Number(process.env.PORT || 4173);
export const ORIGIN = `http://127.0.0.1:${PORT}`;

export const FIXTURE = Object.freeze({
  timezoneId: 'America/Lima',
  locale: 'es-PE',
  region: 'pe',
});

/** Chromium flags so headless runners without a GPU still expose WebGL (TC14). */
export const SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
