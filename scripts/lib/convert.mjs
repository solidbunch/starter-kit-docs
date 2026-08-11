import { createMarkdownIt, renderInline } from './inline.mjs';
import * as B from './blocks.mjs';

/**
 * Converts one Markdown doc file into `starter-kit/*`/core block markup.
 *
 * Walks markdown-it's flat token stream and emits one block per top-level construct. Any
 * token type this converter does not know how to handle throws, naming the type and
 * `file:line` — silent dropping is forbidden (Decision 2/Task 2.4).
 *
 * @param {object} args
 * @param {string} args.file Relative path, e.g. "installation.md" — used only for error/warning
 *   messages naming the source location.
 * @param {string} args.source Raw Markdown source of `file`.
 * @param {{file: string, slug: string}[]} args.manifest Full manifest, for link rewriting.
 * @returns {{slug: string, blocks: object[], warnings: string[]}}
 */
export function convertFile({ file, source, manifest }) {
  const entry = manifest.find((m) => m.file === file);
  if (!entry) {
    throw new Error(`convert: ${file}: not present in the manifest (index.md)`);
  }

  const md = createMarkdownIt(manifest);
  const env = { file };
  const tokens = md.parse(source, env);

  const warnings = [];
  const blocks = [];

  // The document's title heading (the first `heading_open` token in the file) is skipped here
  // and never converted into a `starter-kit/heading` block: WordPress already stores it
  // separately as `post_title`, not as part of `content`. Emitting it again would duplicate the
  // title at the top of every generated page's body. This is positional (first heading token
  // encountered), not level-based — `advanced-installation-options.md` and
  // `project-architecture-and-structure.md` both open with `##` (level 2) rather than `#`, so
  // "skip level-1 headings" would miss those two files' title headings.
  let titleHeadingSkipped = false;

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    switch (t.type) {
      case 'heading_open': {
        if (!titleHeadingSkipped) {
          titleHeadingSkipped = true;
          i += 3; // heading_open, inline, heading_close — matches post_title, not content
          break;
        }
        const level = Number(t.tag.slice(1));
        const html = renderInline(md, tokens[i + 1], env);
        blocks.push(B.heading(level, html));
        i += 3; // heading_open, inline, heading_close
        break;
      }

      case 'paragraph_open': {
        const html = renderInline(md, tokens[i + 1], env);
        blocks.push(B.paragraph(html));
        i += 3; // paragraph_open, inline, paragraph_close
        break;
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const result = walkList(tokens, i, md, env, file);
        blocks.push(...result.siblings);
        warnings.push(...result.warnings);
        i = result.nextIndex;
        break;
      }

      case 'fence': {
        blocks.push(B.code(...fenceToCode(t, md)));
        i += 1;
        break;
      }

      case 'blockquote_open': {
        const result = walkBlockquote(tokens, i, md, env, file);
        blocks.push(result.node);
        i = result.nextIndex;
        break;
      }

      case 'hr': {
        blocks.push(B.separator());
        i += 1;
        break;
      }

      case 'table_open': {
        const result = walkTable(tokens, i, md, env, file);
        blocks.push(result.node);
        i = result.nextIndex;
        break;
      }

      case 'html_block': {
        const match = t.content.trim().match(/^<!-- embed: (\S+) -->$/);
        if (!match) {
          throw unsupportedToken(t, file);
        }
        blocks.push(B.embed(match[1]));
        i += 1;
        break;
      }

      default:
        throw unsupportedToken(t, file);
    }
  }

  return { slug: entry.slug, blocks, warnings };
}

function unsupportedToken(t, file) {
  const line = t.map ? t.map[0] + 1 : '?';
  return new Error(`convert: ${file}:${line}: unsupported token type "${t.type}"`);
}

/**
 * Escapes only `&`, `<`, `>` — the minimum needed for text placed inside a `<code>` element's
 * text node. Unlike `md.utils.escapeHtml` (which also escapes `"` and `'` for attribute-value
 * safety), quotes must stay literal here: live pages have e.g. `"installer-paths": {` verbatim
 * inside `starter-kit/code`'s `<code>` content, not `&quot;installer-paths&quot;: {`.
 */
function escapeCodeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Fence info-string -> [language, escapedContent]. A language-less fence (no info string, or
 * an info string that is only whitespace — e.g. troubleshooting.md:47's trailing-whitespace
 * opener) yields `language === undefined`, matching `starter-kit/code`'s `auto` default
 * (Decision 3b) — never an empty-string language.
 */
function fenceToCode(t, md) {
  const info = (t.info || '').trim();
  const language = info === '' ? undefined : info.split(/\s+/)[0];
  const content = t.content.replace(/\n$/, '');
  return [language, escapeCodeText(content)];
}

/**
 * Walks one `bullet_list_open`/`ordered_list_open` ... `_close` range.
 *
 * Returns `siblings`, the block(s) that should appear at the call site's own sibling level:
 * normally exactly one `starter-kit/list-section`, but more than one if a fenced code block
 * was found inside a list item (Decision 4's split-and-warn) — in which case the list is
 * closed, the code block emitted, and a fresh list-section opened for the remaining items,
 * with a warning logged for each split.
 *
 * Note on nesting: if a split happens inside a *nested* list (a sub-list inside a list item),
 * the split bubbles up only as far as the immediate parent's sibling stream (i.e. becomes a
 * sibling inside the parent list-section's own children), not literally all the way to the
 * page root, since `starter-kit/list-item` cannot hold arbitrary block children. This doc set's
 * three known split points (Decision 4) are all at the top level, where "immediate parent" and
 * "page root" are the same thing, so this distinction has no observable effect today.
 */
function walkList(tokens, startIndex, md, env, file) {
  const listToken = tokens[startIndex];
  const listType = listToken.type === 'bullet_list_open' ? 'ul' : 'ol';
  const closeType = listToken.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';

  let i = startIndex + 1;
  let currentItems = [];
  const siblings = [];
  const warnings = [];

  const flushSection = () => {
    if (currentItems.length > 0) {
      siblings.push(B.listSection(listType, currentItems));
      currentItems = [];
    }
  };

  while (tokens[i].type !== closeType) {
    if (tokens[i].type !== 'list_item_open') {
      throw unsupportedToken(tokens[i], file);
    }

    i += 1; // past list_item_open
    let itemHtmlParts = [];

    const flushItemText = () => {
      if (itemHtmlParts.length) {
        currentItems.push(B.listItem(itemHtmlParts.join('')));
        itemHtmlParts = [];
      }
    };

    while (tokens[i].type !== 'list_item_close') {
      const t = tokens[i];

      if (t.type === 'paragraph_open') {
        itemHtmlParts.push(renderInline(md, tokens[i + 1], env));
        i += 3;
      } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
        flushItemText();
        const nested = walkList(tokens, i, md, env, file);
        currentItems.push(...nested.siblings);
        warnings.push(...nested.warnings);
        i = nested.nextIndex;
      } else if (t.type === 'fence') {
        flushItemText();
        flushSection();
        siblings.push(B.code(...fenceToCode(t, md)));
        const line = t.map ? t.map[0] + 1 : '?';
        const kind = listType === 'ol' ? 'ordered' : 'unordered';
        const detail = listType === 'ol' ? '; numbering restarts' : '';
        warnings.push(`${file}:${line} ${kind} list split by nested code block${detail}`);
        i += 1;
      } else {
        throw unsupportedToken(t, file);
      }
    }

    flushItemText();
    i += 1; // past list_item_close
  }

  flushSection();
  i += 1; // past the list's own close token

  return { siblings, nextIndex: i, warnings };
}

/**
 * Walks one `blockquote_open` ... `blockquote_close` range. Only paragraph children are
 * supported (the only shape present in this doc set — Decision 2's ~30 blockquotes); each
 * source paragraph becomes one `<p>` inside the emitted `core/quote`.
 */
function walkBlockquote(tokens, startIndex, md, env, file) {
  let i = startIndex + 1;
  const paragraphs = [];

  while (tokens[i].type !== 'blockquote_close') {
    const t = tokens[i];
    if (t.type === 'paragraph_open') {
      paragraphs.push(renderInline(md, tokens[i + 1], env));
      i += 3;
    } else {
      throw unsupportedToken(t, file);
    }
  }

  i += 1; // past blockquote_close
  return { node: B.quote(paragraphs), nextIndex: i };
}

/**
 * Walks one GFM `table_open` ... `table_close` range into a `core/table` block. markdown-it's
 * table tokens: `table_open, thead_open, tr_open, (th_open, inline, th_close)+, tr_close,
 * thead_close, tbody_open, (tr_open, (td_open, inline, td_close)+, tr_close)*, tbody_close,
 * table_close`.
 */
function walkTable(tokens, startIndex, md, env, file) {
  let i = startIndex + 1;

  if (tokens[i].type !== 'thead_open') throw unsupportedToken(tokens[i], file);
  i += 1;
  if (tokens[i].type !== 'tr_open') throw unsupportedToken(tokens[i], file);
  i += 1;

  const head = [];
  while (tokens[i].type === 'th_open') {
    head.push(renderInline(md, tokens[i + 1], env));
    i += 3; // th_open, inline, th_close
  }

  if (tokens[i].type !== 'tr_close') throw unsupportedToken(tokens[i], file);
  i += 1;
  if (tokens[i].type !== 'thead_close') throw unsupportedToken(tokens[i], file);
  i += 1;

  const bodyRows = [];
  if (tokens[i].type === 'tbody_open') {
    i += 1;
    while (tokens[i].type === 'tr_open') {
      i += 1;
      const row = [];
      while (tokens[i].type === 'td_open') {
        row.push(renderInline(md, tokens[i + 1], env));
        i += 3; // td_open, inline, td_close
      }
      if (tokens[i].type !== 'tr_close') throw unsupportedToken(tokens[i], file);
      i += 1;
      bodyRows.push(row);
    }
    if (tokens[i].type !== 'tbody_close') throw unsupportedToken(tokens[i], file);
    i += 1;
  }

  if (tokens[i].type !== 'table_close') throw unsupportedToken(tokens[i], file);
  i += 1;

  return { node: B.table(head, bodyRows), nextIndex: i };
}
