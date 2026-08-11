/**
 * One pure emitter function per block shape used by this converter.
 *
 * Each emitter returns a `{blockName, attrs, innerBlocks, innerHTML}` node object — the JSON
 * shape consumed by the `POST /wp-json/skt/v1/serialize-blocks` endpoint
 * (`starter-kit-foundation.loc`, commit `1ec22ae`), which owns the outer serialization
 * mechanics: block-comment delimiters, namespace stripping, attrs JSON encoding, the `"\n\n"`
 * sibling glue, and `wp_kses_post()`. It does NOT own the contents of `innerHTML`, and it does
 * NOT decide which attributes appear — see "Per-attribute default omission" below. Everything
 * this module has ever had to say about the byte shape of a block's `innerHTML` and attrs
 * therefore still applies.
 *
 * `blockName` MUST be fully-qualified (`core/paragraph`, not `paragraph`) for every block,
 * including core ones — the endpoint validates against the block type registry
 * (`BlockTreeSerializer.php:174`) and rejects shorthand names with a 400; core itself strips the
 * `core/` namespace when it writes the delimiter (`blocks.php:1671-1677`), so the fully-qualified
 * name in is both required and correct. `starter-kit/*` names are already fully qualified.
 *
 * Per-attribute default omission stays a client responsibility. `get_comment_delimited_block_
 * content()` (`starter-kit-foundation.loc/web/wp-core/wp-includes/blocks.php:1690-1709`) only
 * omits the JSON attrs object entirely when the whole attrs array is empty (`empty()`) — there is
 * no per-attribute comparison against `block.json` defaults anywhere on the PHP path (that logic
 * lives in the block editor's JS `getCommentAttributes()`, not involved here). `level: 2`,
 * `ordered: false`, and `language: "auto"` must therefore continue to be omitted by the caller,
 * exactly as before — sending `attrs: {level: 2}` would produce
 * `<!-- wp:starter-kit/heading {"level":2} -->` and break idempotency on every page with an `##`
 * heading.
 *
 * IMPORTANT — sourcing, corrected 2026-08-10 (later same day): `paragraph`, `listSection`/
 * `listItem`, and `quote` below are derived from `scripts/fixtures/live-reference/*.html` — the
 * real, verbatim `post_content` of the 17 already-published `doc-page` posts on
 * `starter-kit.loc` — NOT from `fixtures/golden-blocks.html` (Task 1.1's synthetic capture).
 * The synthetic capture assumed `starter-kit/paragraph` and `starter-kit/list-section`/
 * `list-item` were the live convention; they are not (0 occurrences across all 17 live pages).
 * The real, established convention is `core/paragraph` and `core/list`/`core/list-item` — see
 * `.claude/plans/architect-plan-docs-sync-script-stage1.md`'s "Update 2026-08-10 (later same
 * day)" section. `heading`, `code`'s language logic, `separator` remain sourced from
 * `golden-blocks.html`/Task 1.1 as before (still correct), except `code`'s `<pre>` class list,
 * corrected below per the same real-fixture evidence, and `table`, whose real live markup
 * carries a `has-fixed-layout` class on `<table>` not present in the synthetic capture.
 *
 * Key rules, confirmed against `scripts/fixtures/live-reference/*.html` (e.g. `installation.html`,
 * `usage.html`, which between them exercise all 7 mapped block types):
 * - A block comment's JSON attributes object omits any attribute equal to its block.json
 *   `default` (WordPress's own serializer behavior — `getCommentAttributes()`). `level:2`,
 *   `ordered:false`/absent, `language:"auto"` are therefore never written.
 * - `core/paragraph` saves as a bare `<p>` with NO class attribute at all.
 * - `core/list-item` saves as `<li>` (no class) wrapping the item's inline HTML — unlike the
 *   theme's own `starter-kit/list-item`, this DOES wrap in a real `<li>` element.
 * - `core/list`'s `<ul>`/`<ol>` wrapper carries class `wp-block-list`, with NO whitespace
 *   between its opening tag and the first child block comment, and NO whitespace between the
 *   last child block comment and its closing tag (both now server-owned, via `innerBlocks`).
 * - `core/quote` wraps InnerBlocks `core/paragraph` blocks (one per source paragraph), not raw
 *   `<p>` tags with no block comments.
 * - `starter-kit/code`'s `<pre>` class is `sk-block-code` ONLY — no `wp-block-starter-kit-code`
 *   (real live markup contradicts the synthetic capture here; real markup wins).
 * - `core/table`'s `<table>` carries class `has-fixed-layout` (present on all 6 live table
 *   instances; the synthetic capture omitted it — real markup wins).
 */

/**
 * `core/paragraph` (WordPress core block — `starter-kit/paragraph` is never used live, see
 * module doc comment). `contentHtml` is the already-inline-rendered, entity-escaped HTML of the
 * paragraph body (e.g. from lib/inline.mjs). No class attribute on the `<p>`.
 *
 * @param {string} contentHtml
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function paragraph(contentHtml) {
  return {
    blockName: 'core/paragraph',
    attrs: {},
    innerBlocks: [],
    innerHTML: `\n<p>${contentHtml}</p>\n`,
  };
}

/**
 * `starter-kit/heading`. `level` 1-6; the JSON `level` attribute is omitted for level 2
 * (block.json's default).
 *
 * @param {number} level
 * @param {string} contentHtml
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function heading(level, contentHtml) {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new Error(`blocks.heading: level must be an integer 1-6, got ${level}`);
  }
  // No class attribute: confirmed against all 102 heading instances across the 17 live
  // fixtures (scripts/fixtures/live-reference/*.html) — real markup wins over golden-blocks.html's
  // synthetic capture, same principle applied to paragraph/list/quote/code/table.
  return {
    blockName: 'starter-kit/heading',
    attrs: level === 2 ? {} : { level },
    innerBlocks: [],
    innerHTML: `\n<h${level}>${contentHtml}</h${level}>\n`,
  };
}

/**
 * `core/list` (WordPress core block — `starter-kit/list-section` is never used live, see
 * module doc comment). `listType` is `"ul"` or `"ol"`; the JSON `ordered` attribute is emitted
 * as `true` only for `"ol"` (omitted, i.e. defaulting to unordered, for `"ul"`). `childNodes`
 * is an array of already-built `core/list-item`/`core/list` node objects — passed through as
 * `innerBlocks`, unjoined; the sibling glue between them is server-owned.
 *
 * @param {'ul'|'ol'} listType
 * @param {object[]} childNodes
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function listSection(listType, childNodes) {
  if (listType !== 'ul' && listType !== 'ol') {
    throw new Error(`blocks.listSection: listType must be "ul" or "ol", got ${JSON.stringify(listType)}`);
  }
  const tag = listType;
  return {
    blockName: 'core/list',
    attrs: listType === 'ol' ? { ordered: true } : {},
    innerBlocks: childNodes,
    innerHTML: `\n<${tag} class="wp-block-list"></${tag}>\n`,
  };
}

/**
 * `core/list-item` (WordPress core block — `starter-kit/list-item` is never used live, see
 * module doc comment). `contentHtml` is the item's already-inline-rendered HTML, wrapped in a
 * bare `<li>` (no class).
 *
 * @param {string} contentHtml
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function listItem(contentHtml) {
  return {
    blockName: 'core/list-item',
    attrs: {},
    innerBlocks: [],
    innerHTML: `\n<li>${contentHtml}</li>\n`,
  };
}

/**
 * `starter-kit/code`. `language` is the fence's info string, or `undefined`/`"auto"` for a
 * language-less fence — both omit the JSON `language` attribute and the `<code>` class.
 * `escapedContent` must already be HTML-entity-escaped (`&`, `<`, `>`) by the caller
 * (e.g. via `md.utils.escapeHtml` — see lib/convert.mjs); this function does not escape it
 * again, matching the block's own save() which interpolates raw JSX text (auto-escaped once,
 * by React, at the point the theme's editor serializes it — never twice).
 *
 * @param {string|undefined} language
 * @param {string} escapedContent
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function code(language, escapedContent) {
  const isAuto = !language || language === 'auto';
  const codeClass = isAuto ? '' : ` class="language-${language}"`;
  return {
    blockName: 'starter-kit/code',
    attrs: isAuto ? {} : { language },
    innerBlocks: [],
    innerHTML: `\n<pre class="sk-block-code"><code${codeClass}>${escapedContent}</code></pre>\n`,
  };
}

/**
 * `core/quote` (WordPress core block). Corrected 2026-08-10 (later same day) against real live
 * markup: `paragraphsHtml` is one already-inline-rendered, entity-escaped HTML string per source
 * paragraph; each becomes its own nested `core/paragraph` InnerBlock node, directly inside one
 * `<blockquote class="wp-block-quote">` — NOT raw `<p>` tags with no block comments (the
 * synthetic Task 1.1 capture's assumption). Confirmed against `scripts/fixtures/live-reference/
 * installation.html` (single- and two-paragraph examples) and `usage.html`.
 *
 * @param {string[]} paragraphsHtml
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function quote(paragraphsHtml) {
  if (!Array.isArray(paragraphsHtml) || paragraphsHtml.length === 0) {
    throw new Error('blocks.quote: paragraphsHtml must be a non-empty array');
  }
  return {
    blockName: 'core/quote',
    attrs: {},
    innerBlocks: paragraphsHtml.map((p) => paragraph(p)),
    innerHTML: '\n<blockquote class="wp-block-quote"></blockquote>\n',
  };
}

/**
 * `core/table` (WordPress core block; the theme has no table block of its own — Decision 2).
 * `head` is an array of already-inline-rendered header cell HTML strings (rendered as `<th>`);
 * `bodyRows` is an array of rows, each an array of already-inline-rendered cell HTML strings
 * (rendered as `<td>`). The `<table>` carries class `has-fixed-layout` — present on all 6 live
 * table instances (`scripts/fixtures/live-reference/{usage,makefile-reference,advanced-
 * installation-options,platform-notes}.html`); the synthetic Task 1.1 capture omitted it, real
 * markup wins. Unchanged from before the node-shape migration — the table's own markup carries
 * no InnerBlocks, so it stays a single flat `<figure>`/`<table>` string inside `innerHTML`.
 *
 * @param {string[]} head
 * @param {string[][]} bodyRows
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function table(head, bodyRows) {
  const theadRow = head.length
    ? `<thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>`
    : '';
  const tbodyRows = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('');
  return {
    blockName: 'core/table',
    attrs: {},
    innerBlocks: [],
    innerHTML: `\n<figure class="wp-block-table"><table class="has-fixed-layout">${theadRow}<tbody>${tbodyRows}</tbody></table></figure>\n`,
  };
}

/**
 * `core/separator` (WordPress core block, for Markdown thematic breaks `---`).
 *
 * Self-closing tag has a space before `/>` (`... /&gt;` not `...&gt;/`) — WordPress's
 * `wp_kses_post` (applied on save for any account without `unfiltered_html`, e.g. `docs-bot`)
 * normalizes self-closing tags this way, so the byte shape must match it post-save or every
 * subsequent sync run reports this block's page as `updated` forever, breaking idempotency
 * (confirmed live 2026-08-10: 10 of 18 pages failed idempotency on a second run before this fix,
 * every one containing a `core/separator`).
 *
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function separator() {
  return {
    blockName: 'core/separator',
    attrs: {},
    innerBlocks: [],
    innerHTML: '\n<hr class="wp-block-separator has-alpha-channel-opacity" />\n',
  };
}

/**
 * `starter-kit/row` > `starter-kit/column` > `core/embed` (YouTube video), special-cased for the
 * single `<!-- embed: URL --> ` marker in `overview.md` (Update 2026-08-10, "one video embed,
 * overview.md only"). Byte shape verified against the live fixture
 * (`scripts/fixtures/live-reference/overview.html:9-15`) — `properties`/`spacers`/`size` JSON
 * values and the `justify-content-center mt-3 mb-3` row classes are the real captured values,
 * not invented. This is a special-cased marker, not a general embed system — if a second video
 * ever gets added, extend `convert.mjs`'s handling then, don't generalize speculatively now.
 *
 * The `properties`/`spacers`/`size` values below are copied LITERALLY from the pre-migration
 * string-emitting version of this function — including the `[]` vs `{}` distinction inside each
 * (`properties.sm`/`md`/`xl`/`xxl` and `size.sm`/`md`/`xl`/`xxl` are arrays; `spacers.sm`/`md`/
 * `xl`/`xxl` are objects). The endpoint round-trips this distinction
 * (`architect-plan-serialize-blocks-json-object-array-fix.md`); normalizing it away here would
 * silently break `overview.md`'s idempotency forever. Do not "tidy" these values.
 *
 * @param {string} url
 * @returns {{blockName: string, attrs: object, innerBlocks: object[], innerHTML: string}}
 */
export function embed(url) {
  if (!url || typeof url !== 'string') {
    throw new Error(`blocks.embed: url must be a non-empty string, got ${JSON.stringify(url)}`);
  }

  const embedBlock = {
    blockName: 'core/embed',
    attrs: {
      url,
      type: 'video',
      providerNameSlug: 'youtube',
      responsive: true,
      className: 'wp-embed-aspect-16-9 wp-has-aspect-ratio',
    },
    innerBlocks: [],
    innerHTML: `\n<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">\n${url}\n</div></figure>\n`,
  };

  const columnBlock = {
    blockName: 'starter-kit/column',
    attrs: {
      size: {
        xs: { mod: 'default' },
        sm: [],
        md: [],
        lg: { mod: 'custom', valueRange: 8 },
        xl: [],
        xxl: [],
      },
    },
    innerBlocks: [embedBlock],
    innerHTML: '\n<div class="col col-lg-8"></div>\n',
  };

  return {
    blockName: 'starter-kit/row',
    attrs: {
      properties: {
        xs: { justifyContent: 'center' },
        sm: [],
        md: [],
        lg: [],
        xl: [],
        xxl: [],
      },
      spacers: {
        xs: { valueRange: { 'mt-xs': 3, 'mb-xs': 3 } },
        sm: {},
        md: {},
        lg: {},
        xl: {},
        xxl: {},
      },
    },
    innerBlocks: [columnBlock],
    innerHTML: '\n<div class="row justify-content-center mt-3 mb-3"></div>\n',
  };
}
