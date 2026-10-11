/**
 * Legal-placeholder guard (I-40, decision D9). Finds bracketed template tokens such as
 * "[Nombre o razón social]", "[NIF]" or "[email]" that the owner has not filled in yet.
 * Warn mode (default) reports them; PLACEHOLDER_GUARD=block makes them fail.
 */
export const PLACEHOLDER = /\[[A-ZÁÉÍÓÚÑa-záéíóúñ ]{2,40}\]/g;

/** @returns {'warn'|'block'} */
export function guardMode(env = process.env) {
  return env.PLACEHOLDER_GUARD === 'block' ? 'block' : 'warn';
}

/** Placeholders in markup text (visible text nodes, attribute values): every bracket token counts. */
export function scanMarkup(label, items) {
  const found = [];
  for (const { text, line } of items) for (const m of text.matchAll(PLACEHOLDER)) found.push({ where: label, line, token: m[0] });
  return found;
}

/**
 * String-literal bodies of a piece of JS (quotes, template literals), skipping comments.
 * For template literals only the static text is returned: `${...}` expressions are skipped,
 * so `${tipos[tipo](id)}` is not mistaken for a "[tipo]" placeholder.
 */
export function stringLiterals(src) {
  const out = [];
  const skipExpression = (k) => {
    // k points just after "${"; returns the index just after the matching "}"
    let depth = 1;
    while (k < src.length && depth > 0) {
      const c = src[k];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        k += 1;
        while (k < src.length && src[k] !== q) k += src[k] === '\\' ? 2 : 1;
      } else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      k += 1;
    }
    return k;
  };
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') i = src.indexOf('\n', i) === -1 ? src.length : src.indexOf('\n', i);
    else if (c === '/' && src[i + 1] === '*') i = src.indexOf('*/', i) === -1 ? src.length : src.indexOf('*/', i) + 2;
    else if (c === '"' || c === "'" || c === '`') {
      let text = '';
      let k = i + 1;
      while (k < src.length && src[k] !== c) {
        if (src[k] === '\\') {
          text += src.slice(k, k + 2);
          k += 2;
        } else if (c === '`' && src[k] === '$' && src[k + 1] === '{') k = skipExpression(k + 2);
        else {
          text += src[k];
          k += 1;
        }
      }
      out.push({ text, index: i });
      i = k + 1;
    } else i += 1;
  }
  return out;
}

/**
 * Placeholders in code: only inside string literals, because `JS[actual][k]` or a selector such as
 * '[alt]' are not placeholders. A purely lowercase single-word token in a literal without whitespace
 * ('[alt],[aria-label]') is selector-shaped and ignored; '... Contact: [email].' is flagged.
 */
export function scanCode(label, src, firstLine = 1) {
  const found = [];
  for (const lit of stringLiterals(src)) {
    for (const m of lit.text.matchAll(PLACEHOLDER)) {
      if (/^\[[a-z]+\]$/.test(m[0]) && !/\s/.test(lit.text)) continue;
      const line = firstLine + (src.slice(0, lit.index).match(/\n/g) || []).length;
      found.push({ where: label, line, token: m[0] });
    }
  }
  return found;
}

/** @returns {{fail:boolean, summary:string}} */
export function evaluateGuard(matches, mode) {
  const distinct = [...new Set(matches.map((m) => m.token))];
  const summary = `${matches.length} legal placeholder(s) in ${distinct.length} distinct token(s): ${distinct.join(' ')}`;
  return { fail: mode === 'block' && matches.length > 0, summary };
}
