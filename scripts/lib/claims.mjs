import MarkdownIt from 'markdown-it';

/**
 * Markdown -> checkable claims. Pure: no filesystem access, so it is unit-testable with inline
 * synthetic Markdown. `lib/foundation.mjs` verifies the claims against the foundation checkout;
 * `check-doc-claims.mjs` prints them.
 *
 * Same markdown-it options as `lib/inline.mjs`'s `createMarkdownIt()`, so tokenization matches
 * the converter. `createMarkdownIt(manifest)` itself is not used: it needs the manifest for link
 * rewriting, which claims don't. Footnote definitions are not parsed (no plugin), so a
 * `[^x]: ...` line is a plain paragraph — that is what keeps footnotes out of "table rows only"
 * Makefile coverage.
 *
 * A `Claim` is
 * `{kind, value, raw, file, line, negated, source, context, anchor, unresolved, args?}`:
 * - `kind`: `make` | `make-args` | `path` | `relpath` | `var` | `workflow`
 * - `value`: normalized/resolved value (a `.../x/` span is expanded from its anchor);
 *   placeholders are kept as written.
 * - `negated`: the wording says the thing does NOT exist (inline code and bold only).
 * - `source`: `code` | `strong` | `fence`; `context`: innermost enclosing block
 *   (`table` | `paragraph` | `heading` | `list` | `blockquote` | `fence`).
 * - `anchor` / `unresolved`: only for a shortened `.../x/` span (see {@link extractClaims}).
 */

const md = new MarkdownIt({ html: true, linkify: false, breaks: false, xhtmlOut: false });

/**
 * Maximum number of words `make <target>` accepts after the target, by target. Mirrors the
 * foundation's `Makefile:170-172` (`exec:` -> `bash ./sh/dev/run.sh exec $(PARAMS)`) and
 * `sh/dev/run.sh:13-34`, which reads only `"$1"` (mode), `"$2"` (service) and `"$3"` (user):
 * every further word is silently dropped, so a doc that shows one is documenting a command that
 * does not do what it says. Other targets' argument handling is not mechanically checked.
 */
export const MAKE_ARG_LIMITS = Object.freeze({ exec: 2, run: 2 });

/** Path prefixes (with the slash) that make an inline code token a checkable `path` claim. */
const FULL_PATH_PREFIXES = ['kit-modules/', 'sh/', 'config/', 'dockerfiles/', '.github/', '.gitlab/'];

const PLACEHOLDER_RE = /<[^>]+>|\[[^\]]+\]|\{[^}]+\}|\*\*|\*/;
const MAKE_TARGET_RE = /^[a-z0-9][a-z0-9_.-]*$/;
const ASSIGNMENTS_RE = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/;
const VAR_NAME = '(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|TF_VAR_[A-Za-z0-9_]+)';
const VAR_PIECE_RE = new RegExp(`^\\$?\\{?(${VAR_NAME})\\}?$`);
const VAR_ASSIGN_RE = new RegExp(`^\\$?\\{?(${VAR_NAME})\\}?=.*$`);
const WORKFLOW_RE = /^[A-Za-z0-9_.*<>{}[\]-]+\.ya?ml$/;
const URL_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const NOUN_RE = /^\s*(directory|dir|folder|file)\b/i;

/** Stands in for a code span in the text built for negation windows. */
const MARK = '\u0001';
const SENTENCE_STOP_RE = /[.;\u0001]/;

const NEGATED_AFTER_RE =
  /^[\s)]*(?:(?:directory|dir|folder|file|target|variable)\s+)?(?:(?:does not|doesn't|do not|don't|did not|no longer|never)\s+exists?\b|(?:is|are)\s+(?:not|no longer)\s+(?:present|there|shipped|included|defined)\b|(?:was|were|has been|have been)\s+removed\b)/i;
const NEGATED_BEFORE_RE = /\b(?:there is|there's|there are)\s+no\s+(?:\w+\s+){0,2}$|\bno such\s+(?:\w+\s+)?$/i;

const OPEN_CONTAINERS = {
  blockquote_open: 'blockquote',
  list_item_open: 'list',
  td_open: 'table',
  th_open: 'table',
};
const CLOSE_CONTAINERS = new Set(['blockquote_close', 'list_item_close', 'td_close', 'th_close']);

/**
 * Split a command string at unquoted `&&`, `||`, `;`, `|`, `$(` and `)`, stopping at an unquoted
 * ` #` comment. Quote-aware so `-e "SELECT 1; SELECT 2"` stays one command.
 *
 * @param {string} str
 * @returns {string[]}
 */
function splitCommands(str) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    const two = str.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '$(') {
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    if (ch === ';' || ch === '|' || ch === ')') {
      out.push(cur);
      cur = '';
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(str[i - 1]))) break;
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Split on whitespace; a `"..."` / `'...'` group is one word (quotes are kept).
 *
 * @param {string} str
 * @returns {string[]}
 */
function splitWords(str) {
  const words = [];
  let cur = '';
  let quote = null;
  for (const ch of str) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (/\s/.test(ch)) {
      if (cur !== '') words.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur !== '') words.push(cur);
  return words;
}

/**
 * Find `make <target> ...` commands in a string. A `make` only counts at the start of a command
 * (after optional `VAR=value ` assignments), so `sudo apt install make git` and prose like
 * "make sure" are ignored.
 *
 * @param {string} str
 * @param {{lineStart: boolean, onlyFirst: boolean}} opts `lineStart`: the string is a fence line,
 *   so a `$ ` prompt and `sudo ` may precede the first command. `onlyFirst`: inline spans — only
 *   the command the span starts with counts.
 * @returns {{target: string, words: string[]}[]} `words` = everything after the target.
 */
function findMakeCommands(str, { lineStart, onlyFirst }) {
  const found = [];
  const segments = splitCommands(str);
  for (let i = 0; i < segments.length; i++) {
    if (onlyFirst && i > 0) break;
    let s = segments[i].replace(/^\s+/, '');
    if (i === 0 && lineStart) {
      s = s.replace(/^\$\s+/, '').replace(/^sudo\s+/, '');
    }
    s = s.replace(ASSIGNMENTS_RE, '');
    if (!/^make\s/.test(s)) continue;
    const words = splitWords(s);
    const target = words[1];
    if (target === undefined || !MAKE_TARGET_RE.test(target)) continue;
    found.push({ target, words: words.slice(2) });
  }
  return found;
}

/**
 * Inline token children -> one plain string (for negation windows) plus the code spans and bold
 * runs found in it, in order. `text` as is, soft/hard breaks as one space, a code span as {@link MARK}.
 *
 * @param {import('markdown-it').Token[]} children
 * @returns {{text: string, items: {type: 'code' | 'strong', content: string, start: number, end: number, firstText?: string}[]}}
 */
function buildInline(children) {
  let text = '';
  const items = [];
  let strong = null;
  for (const c of children) {
    if (c.type === 'text') {
      text += c.content;
      if (strong) strong.parts.push(c.content);
    } else if (c.type === 'softbreak' || c.type === 'hardbreak') {
      text += ' ';
      if (strong) strong.parts.push(' ');
    } else if (c.type === 'code_inline') {
      items.push({ type: 'code', content: c.content, start: text.length, end: text.length + 1 });
      text += MARK;
      if (strong) strong.hasCode = true;
    } else if (c.type === 'strong_open') {
      strong = { start: text.length, parts: [], hasCode: false };
    } else if (c.type === 'strong_close' && strong) {
      if (!strong.hasCode && strong.parts.length > 0) {
        const content = strong.parts.join('');
        items.push({
          type: 'strong',
          content,
          start: strong.start,
          end: text.length,
          firstText: strong.parts[0],
        });
      }
      strong = null;
    }
  }
  items.sort((a, b) => a.start - b.start);
  return { text, items };
}

/**
 * Does the wording around `[start, end)` say the thing does not exist? Window rules: text after
 * the span (<= 60 chars) and text before it (<= 40 chars), each cut at the sentence boundary
 * (`.`, `;` or another code span).
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
function isNegated(text, start, end) {
  let after = text.slice(end, end + 60);
  const stopAfter = after.search(SENTENCE_STOP_RE);
  if (stopAfter >= 0) after = after.slice(0, stopAfter);
  if (NEGATED_AFTER_RE.test(after)) return true;

  let before = text.slice(Math.max(0, start - 40), start);
  const stops = [...before].reduce((last, ch, i) => (SENTENCE_STOP_RE.test(ch) ? i : last), -1);
  if (stops >= 0) before = before.slice(stops + 1);
  return NEGATED_BEFORE_RE.test(before);
}

/**
 * Strip wrapping punctuation and a leading `./` from a whitespace-delimited span token.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanToken(raw) {
  let s = raw.replace(/^["'(]+/, '').replace(/[,.;:)"']+$/, '');
  if (s.startsWith('./')) s = s.slice(2);
  return s;
}

/**
 * Expand a shortened `.../x/` path from its anchor (the nearest full path before it).
 * If `rest`'s first segment occurs among the anchor's segments, splice at its last occurrence
 * (`kit-modules/basis/terraform/envs/dev` + `terraform/envs/stage`); otherwise the value is
 * `dirname(anchor)/rest` (`.../stage/` after `.../envs/dev` -> `.../envs/stage`).
 *
 * @param {string} anchor
 * @param {string} rest
 * @returns {string}
 */
function expandShortened(anchor, rest) {
  const anchorSegs = anchor.split('/');
  const restSegs = rest.split('/');
  const idx = anchorSegs.lastIndexOf(restSegs[0]);
  const head = idx >= 0 ? anchorSegs.slice(0, idx) : anchorSegs.slice(0, -1);
  return [...head, ...restSegs].join('/');
}

/**
 * Extract every checkable claim from one Markdown page, in document order.
 *
 * Line numbers: fence content line `i` is `token.map[0] + 2 + i`. Inline spans are located by a
 * literal search for the span text in the enclosing block's source lines, from a per-block
 * cursor so a repeated span maps to its own line; if not found (e.g. a span containing escapes),
 * the block's first line is used. Table cells have no `map`, so the row's (`tr_open`) is used.
 *
 * Shortened paths (`.../x/`, `…/x/`): the anchor is the nearest preceding full-path claim in the
 * same inline token, else the nearest one earlier in the file since the last heading. With no
 * anchor the claim has `unresolved: true` and `value` = the part after the ellipsis.
 *
 * @param {{file: string, source: string}} input `file` is the path relative to the docs root.
 * @returns {object[]} Claims (see the file docblock).
 */
export function extractClaims({ file, source }) {
  const tokens = md.parse(source, {});
  const lines = source.split('\n');
  const claims = [];

  const containers = [];
  let inHeading = false;
  let block = null;
  let fileAnchor = null;

  function setBlock(map) {
    if (!map) return;
    block = { map, text: lines.slice(map[0], map[1]).join('\n'), cursor: 0 };
  }

  function locate(needle) {
    if (!block) return 1;
    const idx = needle ? block.text.indexOf(needle, block.cursor) : -1;
    if (idx < 0) return block.map[0] + 1;
    block.cursor = idx + needle.length;
    let n = 0;
    for (let i = 0; i < idx; i++) if (block.text[i] === '\n') n++;
    return block.map[0] + 1 + n;
  }

  function pushMakeClaims(commands, base) {
    for (const { target, words } of commands) {
      claims.push({ ...base, kind: 'make', value: target });
      const limit = MAKE_ARG_LIMITS[target];
      if (limit !== undefined && words.length > limit) {
        claims.push({
          ...base,
          kind: 'make-args',
          value: [target, ...words].join(' '),
          args: words,
        });
      }
    }
  }

  function processFence(t) {
    const fenceLines = t.content.split('\n');
    if (fenceLines[fenceLines.length - 1] === '') fenceLines.pop();
    fenceLines.forEach((text, i) => {
      const commands = findMakeCommands(text, { lineStart: true, onlyFirst: false });
      pushMakeClaims(commands, {
        raw: text.trim(),
        file,
        line: t.map[0] + 2 + i,
        negated: false,
        source: 'fence',
        context: 'fence',
        anchor: null,
        unresolved: false,
      });
    });
  }

  function processInline(t) {
    const { text, items } = buildInline(t.children || []);
    const context = inHeading ? 'heading' : (containers[containers.length - 1] ?? 'paragraph');
    let inlineAnchor = null;

    for (const item of items) {
      const negated = isNegated(text, item.start, item.end);

      if (item.type === 'strong') {
        const lead = (item.firstText.match(/^[\w ]+/) || [''])[0];
        const line = locate(`**${lead}`);
        pushMakeClaims(findMakeCommands(item.content.trim(), { lineStart: false, onlyFirst: true }), {
          raw: `**${item.content}**`,
          file,
          line,
          negated,
          source: 'strong',
          context,
          anchor: null,
          unresolved: false,
        });
        continue;
      }

      const content = item.content;
      const base = {
        raw: `\`${content}\``,
        file,
        line: locate(`\`${content}\``),
        negated,
        source: 'code',
        context,
        anchor: null,
        unresolved: false,
      };

      pushMakeClaims(findMakeCommands(content.trim(), { lineStart: false, onlyFirst: true }), base);

      // var claims
      const trimmed = content.trim();
      const pieces = trimmed.split(/[\s,|/]+/).filter(Boolean);
      const pieceMatches = pieces.map((p) => p.match(VAR_PIECE_RE));
      if (pieces.length > 0 && pieceMatches.every(Boolean)) {
        for (const m of pieceMatches) claims.push({ ...base, kind: 'var', value: m[1] });
      } else {
        const m = trimmed.match(VAR_ASSIGN_RE);
        if (m) claims.push({ ...base, kind: 'var', value: m[1] });
      }

      // path / relpath / workflow claims
      const tokens = trimmed.split(/\s+/).map(cleanToken).filter(Boolean);
      for (const token of tokens) {
        const fullPrefix = FULL_PATH_PREFIXES.some((p) => token.startsWith(p));
        const shortened = /^(?:\.\.\.|…)\//.test(token);

        if (fullPrefix) {
          const value = token.replace(/\/+$/, '');
          claims.push({ ...base, kind: 'path', value });
          inlineAnchor = value;
          fileAnchor = value;
        } else if (shortened) {
          const rest = token.replace(/^(?:\.\.\.|…)\/+/, '').replace(/\/+$/, '');
          if (rest === '') continue;
          const anchor = inlineAnchor ?? fileAnchor;
          if (anchor === null) {
            claims.push({ ...base, kind: 'path', value: rest, unresolved: true });
          } else {
            claims.push({
              ...base,
              kind: 'path',
              value: expandShortened(anchor, rest),
              anchor,
            });
          }
        } else if (!token.includes('/') && WORKFLOW_RE.test(token)) {
          claims.push({ ...base, kind: 'workflow', value: token });
        } else if (token.includes('/')) {
          if (
            negated &&
            !/^[/~$]/.test(token) &&
            !URL_SCHEME_RE.test(token) &&
            !PLACEHOLDER_RE.test(token)
          ) {
            claims.push({ ...base, kind: 'relpath', value: token.replace(/\/+$/, '') });
          }
        } else if (negated && tokens.length === 1 && /^[\w.-]+$/.test(token)) {
          const noun = text.slice(item.end, item.end + 60).match(NOUN_RE);
          if (noun) {
            claims.push({
              ...base,
              kind: 'relpath',
              value: token,
              raw: `${base.raw} ${noun[1]}`,
            });
          }
        }
      }
    }
  }

  for (const t of tokens) {
    if (OPEN_CONTAINERS[t.type]) {
      containers.push(OPEN_CONTAINERS[t.type]);
    } else if (CLOSE_CONTAINERS.has(t.type)) {
      containers.pop();
    } else if (t.type === 'heading_open') {
      inHeading = true;
      fileAnchor = null;
      setBlock(t.map);
    } else if (t.type === 'heading_close') {
      inHeading = false;
    } else if (t.type === 'paragraph_open' || t.type === 'tr_open') {
      setBlock(t.map);
    } else if (t.type === 'fence') {
      processFence(t);
    } else if (t.type === 'inline') {
      processInline(t);
    }
  }

  return claims;
}

const ALLOWLIST_KINDS = ['make', 'make-args', 'path', 'relpath', 'var', 'workflow', 'make-ref'];
const ALLOWLIST_SECTIONS = ['allowed', 'known-drift'];
const ALLOWLIST_ENTRY_RE =
  /^(\S+\.md)\s+(make|make-args|path|relpath|var|workflow|make-ref)\s+(\S(?:.*?\S)?)\s+#\s*(\S.*)$/;

/**
 * Parse `doc-claims-allowlist.txt`. Entries are keyed `<file> <kind> <value>` so one entry
 * suppresses one claim on one page only; a mandatory `# reason` keeps the list from becoming a
 * place to hide drift silently. For `make-args` the value contains spaces: everything between
 * `<kind>` and the `  #` is the value, trimmed.
 *
 * @param {string} text
 * @returns {{section: 'allowed' | 'known-drift', file: string, kind: string, value: string, reason: string, line: number}[]}
 * @throws {Error} `doc-claims-allowlist.txt:<n>: ...` on an entry before any section, an unknown
 *   section or kind, an invalid `file` column, a missing reason or value, or a duplicate key.
 */
export function parseAllowlist(text) {
  const entries = [];
  const seen = new Set();
  let section = null;
  const fail = (n, msg) => {
    throw new Error(`doc-claims-allowlist.txt:${n}: ${msg}`);
  };

  text.split('\n').forEach((rawLine, i) => {
    const n = i + 1;
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) return;

    const header = line.match(/^\[([^\]]*)\]$/);
    if (header) {
      if (!ALLOWLIST_SECTIONS.includes(header[1])) {
        fail(n, `unknown section [${header[1]}] (expected [allowed] or [known-drift])`);
      }
      section = header[1];
      return;
    }

    if (section === null) fail(n, 'entry before any [section] header');

    const loose = line.match(/^(\S+)\s+(\S+)/);
    if (!loose) fail(n, 'malformed entry, expected "<file> <kind> <value>  # reason"');
    const [, file, kind] = loose;
    if (!file.endsWith('.md') || file.includes('/')) {
      fail(n, `invalid file column "${file}" (expected a doc page like usage.md, no directory)`);
    }
    if (!ALLOWLIST_KINDS.includes(kind)) {
      fail(n, `unknown kind "${kind}" (expected ${ALLOWLIST_KINDS.join(' | ')})`);
    }

    const m = line.match(ALLOWLIST_ENTRY_RE);
    if (!m) {
      fail(
        n,
        line.includes('#')
          ? 'missing value or reason, expected "<file> <kind> <value>  # reason"'
          : 'missing "# reason" (a reason is mandatory)',
      );
    }
    const [, , , value, reason] = m;

    const key = `${file} ${kind} ${value}`;
    if (seen.has(key)) fail(n, `duplicate entry "${key}"`);
    seen.add(key);
    entries.push({ section, file, kind, value, reason: reason.trim(), line: n });
  });

  return entries;
}
