/**
 * Minimal CSS reader for ST-CSSFB (I-04). Not a CSS parser: it understands comments, strings,
 * parentheses, plain rules and conditional at-rules (@media, @supports, @layer, @container,
 * @keyframes), which is everything index.html uses.
 */

const CONTAINER_AT_RULES = /^@(media|supports|layer|container|keyframes|-webkit-keyframes|document)\b/i;

function skipQuoted(css, i) {
  const q = css[i];
  let k = i + 1;
  while (k < css.length && css[k] !== q) k += css[k] === '\\' ? 2 : 1;
  return k + 1;
}

/** Index just after the "}" matching the "{" at `open`. */
function matchBrace(css, open) {
  let depth = 0;
  for (let k = open; k < css.length; ) {
    const c = css[k];
    if (c === '"' || c === "'") k = skipQuoted(css, k);
    else if (c === '/' && css[k + 1] === '*') {
      const end = css.indexOf('*/', k + 2);
      k = end === -1 ? css.length : end + 2;
    } else {
      if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) return k + 1;
      k += 1;
    }
  }
  return css.length;
}

/** @returns {{selector:string, raw:string, index:number}[]} every style rule, at-rule contents flattened. */
export function parseRules(css, baseIndex = 0) {
  const rules = [];
  let from = 0;
  for (let k = 0; k < css.length; ) {
    const c = css[k];
    if (c === '/' && css[k + 1] === '*') {
      const end = css.indexOf('*/', k + 2);
      k = end === -1 ? css.length : end + 2;
    } else if (c === '"' || c === "'") {
      k = skipQuoted(css, k);
    } else if (c === ';' || c === '}') {
      from = k + 1;
      k += 1;
    } else if (c === '{') {
      const prelude = css.slice(from, k).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const end = matchBrace(css, k);
      const inner = css.slice(k + 1, end - 1);
      if (CONTAINER_AT_RULES.test(prelude)) rules.push(...parseRules(inner, baseIndex + k + 1));
      else if (!prelude.startsWith('@')) rules.push({ selector: prelude, raw: inner, index: baseIndex + from });
      from = end;
      k = end;
    } else k += 1;
  }
  return rules;
}

/** Splits a declaration block into [{prop, value}] (comments removed, ";" inside () or strings respected). */
export function declarations(raw) {
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let depth = 0;
  let start = 0;
  const flush = (end) => {
    const part = text.slice(start, end).trim();
    const colon = part.indexOf(':');
    if (colon > 0) out.push({ prop: part.slice(0, colon).trim().toLowerCase(), value: part.slice(colon + 1).trim() });
  };
  for (let k = 0; k < text.length; k += 1) {
    const c = text[k];
    if (c === '"' || c === "'") k = skipQuoted(text, k) - 1;
    else if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ';' && depth === 0) {
      flush(k);
      start = k + 1;
    }
  }
  flush(text.length);
  return out;
}

export const EXCEPTION_MARKER = 'css-fallback-exception';

/**
 * ST-CSSFB. A rule violates the contract when:
 *  - a (non custom-property) declaration uses `svh` and no earlier declaration of the same property in the
 *    same rule is free of `svh` (the `vh` fallback);
 *  - `overflow-x|overflow-y|overflow: clip` has no earlier `hidden` declaration of the same property;
 *  - a value uses `color-mix(` and no earlier declaration of the same property is a plain colour (no color-mix);
 *  - `translate:` (other than `none`) has no earlier `transform` declaration in the rule AND the rule
 *    does not carry a comment containing "css-fallback-exception" (the documented exception route).
 * Custom properties (--x) are out of scope: a double declaration does not give them fallback semantics.
 * @returns {{selector:string, property:string, kind:string, value:string}[]}
 */
export function checkCssFallbacks(css) {
  const violations = [];
  for (const rule of parseRules(css)) {
    const decls = declarations(rule.raw);
    const documented = rule.raw.includes(EXCEPTION_MARKER);
    decls.forEach((d, i) => {
      if (d.prop.startsWith('--')) return;
      const earlier = decls.slice(0, i).filter((e) => e.prop === d.prop);
      const add = (kind) => violations.push({ selector: rule.selector, property: d.prop, kind, value: d.value });
      if (/\d(\.\d+)?svh\b/i.test(d.value) && !earlier.some((e) => !/svh\b/i.test(e.value))) add('svh');
      if (/^overflow(-x|-y)?$/.test(d.prop) && /\bclip\b/i.test(d.value) && !earlier.some((e) => /\bhidden\b/i.test(e.value))) add('overflow-clip');
      if (/color-mix\(/i.test(d.value) && !earlier.some((e) => !/color-mix\(/i.test(e.value))) add('color-mix');
      if (d.prop === 'translate' && d.value.toLowerCase() !== 'none' && !documented && !decls.slice(0, i).some((e) => e.prop === 'transform')) add('translate');
    });
  }
  return violations;
}
