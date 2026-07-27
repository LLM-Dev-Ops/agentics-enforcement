/**
 * Minimal TOML reader for Cargo manifests.
 *
 * Supports the subset a Cargo.toml actually uses: table headers, array-of-table
 * headers, dotted keys, basic/literal/multi-line strings, booleans, numbers,
 * arrays, and inline tables (including ones spanning several physical lines).
 * Every leaf key records the 1-based line it was declared on so findings can
 * point at file:line.
 *
 * Not a general TOML implementation: datetimes are kept as raw strings and
 * string escapes other than the quote character are passed through verbatim.
 */

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
export interface TomlTable {
  [key: string]: TomlValue;
}

export interface TomlDoc {
  root: TomlTable;
  /** Dotted path (e.g. "dependencies.serde") -> 1-based declaration line. */
  lines: Map<string, number>;
}

interface LogicalLine {
  text: string;
  line: number;
}

/** Removes an unquoted `#` comment from a single physical line. */
function stripComment(text: string): string {
  let out = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') {
        out += ch + (text[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }
    if (ch === '#') break;
    if (ch === '"' || ch === "'") quote = ch;
    out += ch;
  }
  return out;
}

/** Net depth of unclosed `[` / `{` and whether a string is left open. */
function scanDepth(text: string, state: { depth: number; quote: '"' | "'" | null }): void {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state.quote) {
      if (ch === '\\' && state.quote === '"') {
        i++;
        continue;
      }
      if (ch === state.quote) state.quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") state.quote = ch;
    else if (ch === '[' || ch === '{') state.depth++;
    else if (ch === ']' || ch === '}') state.depth--;
  }
}

/** Joins physical lines into logical ones so multi-line arrays/tables parse as a unit. */
function toLogicalLines(source: string): LogicalLine[] {
  const physical = source.split('\n');
  const result: LogicalLine[] = [];
  let buffer = '';
  let startLine = 0;
  let inMultilineString = false;
  const state = { depth: 0, quote: null as '"' | "'" | null };

  for (let i = 0; i < physical.length; i++) {
    const raw = physical[i];

    if (inMultilineString) {
      buffer += '\n' + raw;
      if (raw.includes('"""') || raw.includes("'''")) {
        inMultilineString = false;
        if (state.depth <= 0) {
          result.push({ text: buffer.trim(), line: startLine });
          buffer = '';
          state.depth = 0;
        }
      }
      continue;
    }

    const stripped = stripComment(raw);
    if (buffer === '' && stripped.trim() === '') continue;
    if (buffer === '') startLine = i + 1;
    buffer = buffer === '' ? stripped : buffer + ' ' + stripped.trim();

    const openMultiline =
      (stripped.split('"""').length - 1) % 2 === 1 || (stripped.split("'''").length - 1) % 2 === 1;
    if (openMultiline) {
      inMultilineString = true;
      continue;
    }

    scanDepth(stripped, state);
    if (state.depth <= 0 && !state.quote) {
      result.push({ text: buffer.trim(), line: startLine });
      buffer = '';
      state.depth = 0;
    }
  }
  if (buffer.trim() !== '') result.push({ text: buffer.trim(), line: startLine });
  return result;
}

/** Splits a dotted key path, honouring quoted segments like `target."cfg(unix)".dependencies`. */
export function splitKeyPath(key: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '.') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts.filter((p) => p !== '');
}

interface Cursor {
  text: string;
  pos: number;
}

function skipWhitespace(cur: Cursor): void {
  while (cur.pos < cur.text.length && /[\s,]/.test(cur.text[cur.pos])) cur.pos++;
}

function readQuoted(cur: Cursor, quote: '"' | "'"): string {
  cur.pos++;
  let out = '';
  while (cur.pos < cur.text.length) {
    const ch = cur.text[cur.pos];
    if (ch === '\\' && quote === '"') {
      const next = cur.text[cur.pos + 1];
      const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };
      out += escapes[next] ?? next;
      cur.pos += 2;
      continue;
    }
    if (ch === quote) {
      cur.pos++;
      return out;
    }
    out += ch;
    cur.pos++;
  }
  return out;
}

function readValue(cur: Cursor): TomlValue {
  skipWhitespace(cur);
  const ch = cur.text[cur.pos];

  if (ch === '"' || ch === "'") {
    const triple = cur.text.startsWith(ch.repeat(3), cur.pos);
    if (triple) {
      const close = cur.text.indexOf(ch.repeat(3), cur.pos + 3);
      const body = cur.text.slice(cur.pos + 3, close === -1 ? cur.text.length : close);
      cur.pos = close === -1 ? cur.text.length : close + 3;
      return body.trim();
    }
    return readQuoted(cur, ch as '"' | "'");
  }

  if (ch === '[') {
    cur.pos++;
    const items: TomlValue[] = [];
    for (;;) {
      skipWhitespace(cur);
      if (cur.pos >= cur.text.length) break;
      if (cur.text[cur.pos] === ']') {
        cur.pos++;
        break;
      }
      items.push(readValue(cur));
    }
    return items;
  }

  if (ch === '{') {
    cur.pos++;
    const table: TomlTable = {};
    for (;;) {
      skipWhitespace(cur);
      if (cur.pos >= cur.text.length) break;
      if (cur.text[cur.pos] === '}') {
        cur.pos++;
        break;
      }
      const keyStart = cur.pos;
      while (cur.pos < cur.text.length && cur.text[cur.pos] !== '=' && cur.text[cur.pos] !== '}') {
        if (cur.text[cur.pos] === '"' || cur.text[cur.pos] === "'") readQuoted(cur, cur.text[cur.pos] as '"');
        else cur.pos++;
      }
      const key = cur.text.slice(keyStart, cur.pos).trim();
      if (cur.text[cur.pos] !== '=') break;
      cur.pos++;
      const value = readValue(cur);
      assignPath(table, splitKeyPath(key), value);
    }
    return table;
  }

  const start = cur.pos;
  while (cur.pos < cur.text.length && !/[,\]}]/.test(cur.text[cur.pos])) cur.pos++;
  const literal = cur.text.slice(start, cur.pos).trim();
  if (literal === 'true') return true;
  if (literal === 'false') return false;
  if (/^[+-]?\d+$/.test(literal)) return Number(literal);
  if (/^[+-]?\d*\.\d+$/.test(literal)) return Number(literal);
  return literal;
}

function assignPath(table: TomlTable, path: string[], value: TomlValue): void {
  let node = table;
  for (let i = 0; i < path.length - 1; i++) {
    const next = node[path[i]];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) node[path[i]] = {};
    node = node[path[i]] as TomlTable;
  }
  node[path[path.length - 1]] = value;
}

function ensureTable(root: TomlTable, path: string[], arrayOfTables: boolean): TomlTable {
  let node = root;
  for (let i = 0; i < path.length; i++) {
    const last = i === path.length - 1;
    let next = node[path[i]];
    if (Array.isArray(next) && !(last && arrayOfTables)) {
      next = next[next.length - 1];
    }
    if (typeof next !== 'object' || next === null) {
      next = last && arrayOfTables ? [] : {};
      node[path[i]] = next as TomlValue;
    }
    if (last && arrayOfTables) {
      const arr = node[path[i]] as TomlValue[];
      const entry: TomlTable = {};
      arr.push(entry);
      return entry;
    }
    if (Array.isArray(next)) {
      const arr = next as TomlValue[];
      node = arr[arr.length - 1] as TomlTable;
    } else {
      node = next as TomlTable;
    }
  }
  return node;
}

export function parseToml(source: string): TomlDoc {
  const root: TomlTable = {};
  const lines = new Map<string, number>();
  let tablePath: string[] = [];

  for (const { text, line } of toLogicalLines(source)) {
    const arrayHeader = /^\[\[(.+)\]\]$/.exec(text);
    if (arrayHeader) {
      tablePath = splitKeyPath(arrayHeader[1]);
      ensureTable(root, tablePath, true);
      continue;
    }
    const header = /^\[(.+)\]$/.exec(text);
    if (header) {
      tablePath = splitKeyPath(header[1]);
      ensureTable(root, tablePath, false);
      lines.set(tablePath.join('.'), line);
      continue;
    }

    const eq = findAssignment(text);
    if (eq === -1) continue;
    const key = text.slice(0, eq).trim();
    const cur: Cursor = { text: text.slice(eq + 1), pos: 0 };
    const value = readValue(cur);
    const keyPath = splitKeyPath(key);
    if (keyPath.length === 0) continue;

    const table = ensureTable(root, tablePath, false);
    assignPath(table, keyPath, value);
    lines.set([...tablePath, ...keyPath].join('.'), line);
    // Dotted keys such as `dep.workspace = true` also anchor the dep itself.
    if (keyPath.length > 1) {
      const owner = [...tablePath, keyPath[0]].join('.');
      if (!lines.has(owner)) lines.set(owner, line);
    }
  }

  return { root, lines };
}

/** Index of the top-level `=` in a key/value logical line, or -1. */
function findAssignment(text: string): number {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '=') return i;
    else if (ch === '[' || ch === '{') return -1;
  }
  return -1;
}

export function asTable(value: TomlValue | undefined): TomlTable | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
  return undefined;
}
