/**
 * Tiny dependency-free HTML tokenizer for the static test layer.
 *
 * Purpose: let static specs read index.html (text nodes, attributes, inline scripts, ids)
 * without a browser and without a heavy parser dependency. It is NOT a conforming HTML5
 * parser; it handles what this page uses: raw-text elements (script, style, textarea, title),
 * void elements, quoted/unquoted attributes, comments and doctype. Anything the page does
 * that this cannot represent should be added here, with a case in tests/static/helpers.spec.js.
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const ATTR = /\s*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * @typedef {{type:'start', name:string, attrs:Record<string,string|true>, selfClosing:boolean, index:number, ancestors:string[]}
 *   | {type:'end', name:string, index:number}
 *   | {type:'text', text:string, raw:boolean, index:number, ancestors:string[]}
 *   | {type:'comment', text:string, index:number}
 *   | {type:'doctype', text:string, index:number}} Token
 */

/** @returns {Token[]} */
export function tokenize(html) {
  const tokens = [];
  const stack = [];
  const n = html.length;
  let i = 0;
  const pushText = (text, index, raw) => {
    if (text !== '') tokens.push({ type: 'text', text: raw ? text : decodeEntities(text), raw, index, ancestors: stack.slice() });
  };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      pushText(html.slice(i), i, false);
      break;
    }
    if (lt > i) pushText(html.slice(i, lt), i, false);
    i = lt;
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      const stop = end === -1 ? n : end;
      tokens.push({ type: 'comment', text: html.slice(i + 4, stop), index: i });
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html.startsWith('<!', i)) {
      const end = html.indexOf('>', i);
      tokens.push({ type: 'doctype', text: html.slice(i + 2, end === -1 ? n : end), index: i });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (html.startsWith('</', i)) {
      const end = html.indexOf('>', i);
      const name = html.slice(i + 2, end === -1 ? n : end).trim().toLowerCase();
      tokens.push({ type: 'end', name, index: i });
      const at = stack.lastIndexOf(name);
      if (at !== -1) stack.length = at;
      i = end === -1 ? n : end + 1;
      continue;
    }
    const nameMatch = /^<([A-Za-z][^\s/>]*)/.exec(html.slice(i, i + 64));
    if (!nameMatch) {
      pushText('<', i, false);
      i += 1;
      continue;
    }
    const name = nameMatch[1].toLowerCase();
    const start = i;
    i += nameMatch[0].length;
    const attrs = {};
    let selfClosing = false;
    for (;;) {
      while (i < n && /\s/.test(html[i])) i += 1;
      if (i >= n) break;
      if (html[i] === '>') {
        i += 1;
        break;
      }
      if (html.startsWith('/>', i)) {
        selfClosing = true;
        i += 2;
        break;
      }
      ATTR.lastIndex = i;
      const m = ATTR.exec(html);
      if (!m || m[0] === '') {
        i += 1; // stray character inside a tag
        continue;
      }
      const value = m[2] ?? m[3] ?? m[4];
      attrs[m[1].toLowerCase()] = value === undefined ? true : decodeEntities(value);
      i = ATTR.lastIndex;
    }
    tokens.push({ type: 'start', name, attrs, selfClosing, index: start, ancestors: stack.slice() });
    if (RAW_TEXT.has(name) && !selfClosing) {
      const close = new RegExp(`</${name}\\s*>`, 'ig');
      close.lastIndex = i;
      const m = close.exec(html);
      const stop = m ? m.index : n;
      stack.push(name);
      pushText(html.slice(i, stop), i, true);
      stack.pop();
      if (m) tokens.push({ type: 'end', name, index: m.index });
      i = m ? m.index + m[0].length : n;
      continue;
    }
    if (!VOID.has(name) && !selfClosing) stack.push(name);
  }
  return tokens;
}

export function lineOf(html, index) {
  let line = 1;
  for (let k = html.indexOf('\n'); k !== -1 && k < index; k = html.indexOf('\n', k + 1)) line += 1;
  return line;
}

const startTokens = (tokens) => tokens.filter((t) => t.type === 'start');

/** Every element start token, optionally filtered by tag name. */
export function elements(tokens, name) {
  return startTokens(tokens).filter((t) => !name || t.name === name);
}

/**
 * Text nodes the page's i18n walker would see: inside <body>, not inside script, style, svg
 * (the walker rejects them) or noscript (spec 4.0: also skipped), trimmed, non-empty, in document order.
 */
export function visibleTextNodes(tokens) {
  const skip = new Set(['script', 'style', 'svg', 'noscript', 'template']);
  return tokens
    .filter((t) => t.type === 'text' && t.ancestors.includes('body') && !t.ancestors.some((a) => skip.has(a)))
    .map((t) => ({ text: t.text.trim(), index: t.index }))
    .filter((t) => t.text !== '');
}

/** alt / aria-label values of elements that are not svg or inside svg (same filter as the page). */
export function attributeKeys(tokens) {
  const out = [];
  for (const t of startTokens(tokens)) {
    if (!t.ancestors.includes('body') || t.name === 'svg' || t.ancestors.includes('svg')) continue;
    for (const a of ['alt', 'aria-label']) if (typeof t.attrs[a] === 'string') out.push({ attr: a, text: t.attrs[a], index: t.index });
  }
  return out;
}

/** Inline <script> elements (no src) with their raw text and effective type. */
export function inlineScripts(tokens) {
  const out = [];
  tokens.forEach((t, k) => {
    if (t.type !== 'start' || t.name !== 'script' || t.attrs.src !== undefined) return;
    const body = tokens[k + 1] && tokens[k + 1].type === 'text' ? tokens[k + 1].text : '';
    const type = typeof t.attrs.type === 'string' ? t.attrs.type.toLowerCase() : '';
    out.push({ attrs: t.attrs, type, text: body, index: t.index, id: t.attrs.id });
  });
  return out;
}

const DATA_TYPES = /(^|\/|\+)json$|^text\/(plain|template)$/;

/** "Executable" for CSP purposes: classic, module and importmap. JSON/data blocks are not governed by script-src. */
export function isExecutableScript(script) {
  return script.type === '' || !DATA_TYPES.test(script.type);
}

/** All ids declared in the markup (static ids only; ids built by JS templates are not visible here). */
export function declaredIds(tokens) {
  return elements(tokens)
    .filter((t) => typeof t.attrs.id === 'string')
    .map((t) => t.attrs.id);
}

/** Concatenated text of every <style> block, for the CSS checks. */
export function styleBlocks(tokens) {
  return tokens.filter((t) => t.type === 'text' && t.raw && t.ancestors.at(-1) === 'style').map((t) => ({ css: t.text, index: t.index }));
}
