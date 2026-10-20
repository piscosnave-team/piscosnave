import { isExecutableScript } from './html.js';
import { sha256Base64 } from './source.js';

/** Directives a <meta> policy cannot honour; Chromium logs a console error for them (TC12). */
export const META_FORBIDDEN = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'];

export function parseCsp(content) {
  const map = new Map();
  for (const part of String(content).split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}

const GSAP_PATH = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/';

/**
 * ST-CSP (spec 4.7, decision D14 = b3 + r1). Returns a list of human-readable violations.
 * @param {import('./html.js').Token[]} tokens @param {ReturnType<typeof import('./html.js').inlineScripts>} scripts
 */
export function checkCsp(tokens, scripts) {
  const v = [];
  const starts = tokens.filter((t) => t.type === 'start');
  const headChildren = starts.filter((t) => t.ancestors.join('/') === 'html/head');
  const cspIdx = headChildren.findIndex((t) => t.name === 'meta' && String(t.attrs['http-equiv']).toLowerCase() === 'content-security-policy');
  if (cspIdx === -1) {
    v.push('no <meta http-equiv="Content-Security-Policy"> in <head>');
  } else {
    const charsetIdx = headChildren.findIndex((t) => t.name === 'meta' && t.attrs.charset !== undefined);
    if (charsetIdx !== 0 || cspIdx !== 1) v.push(`CSP meta must be the first <head> child after <meta charset> (charset at ${charsetIdx}, csp at ${cspIdx})`);
    const csp = parseCsp(headChildren[cspIdx].attrs.content);
    for (const d of META_FORBIDDEN) if (csp.has(d)) v.push(`directive "${d}" is ignored in a meta policy and logs a console error`);
    const want = (dir, sources) => {
      const got = csp.get(dir);
      if (!got) return v.push(`missing directive ${dir}`);
      for (const s of sources) if (!got.includes(s)) v.push(`${dir} must contain ${s}`);
    };
    want('default-src', ["'self'"]);
    want('object-src', ["'none'"]);
    want('base-uri', ["'none'"]);
    want('form-action', ["'none'"]);
    want('connect-src', ["'self'"]);
    want('img-src', ["'self'", 'data:']);
    want('style-src', ["'self'", "'unsafe-inline'"]);
    want('script-src', ["'self'", GSAP_PATH]);
    const script = csp.get('script-src') || [];
    // default-src is the script fallback; script-src-elem/script-src-attr govern
    // executable script elements and event handlers when present.
    for (const directive of ['default-src', 'script-src', 'script-src-elem', 'script-src-attr']) {
      const sources = csp.get(directive);
      if (!sources) continue;
      if (sources.includes("'unsafe-inline'")) v.push(`${directive} must not contain 'unsafe-inline' (b3 uses hashes)`);
      if (sources.includes("'unsafe-eval'")) v.push(`${directive} must not contain 'unsafe-eval'`);
    }
    for (const s of script.filter((x) => /^https?:\/\//.test(x))) if (!s.endsWith('/') || new URL(s).pathname === '/') v.push(`script-src host must be path-pinned to a directory, got ${s}`);
    const have = script.filter((x) => x.startsWith("'sha256-")).map((x) => x.slice(1, -1)).sort();
    const need = scripts.filter(isExecutableScript).map((s) => `sha256-${sha256Base64(Buffer.from(s.text, 'utf8'))}`).sort();
    if (JSON.stringify(have) !== JSON.stringify(need)) v.push(`script-src hash set ${JSON.stringify(have)} != recomputed inline script hashes ${JSON.stringify(need)}`);
  }
  const referrer = starts.find((t) => t.name === 'meta' && t.attrs.name === 'referrer');
  if (!referrer) v.push('no <meta name="referrer"> (decision r1 = no-referrer)');
  else if (referrer.attrs.content !== 'no-referrer') v.push(`referrer policy must be "no-referrer", got "${referrer.attrs.content}"`);
  return v;
}
