import MarkdownIt from 'markdown-it';

/**
 * Builds a slug -> manifest-entry lookup, used by the link rewriter.
 *
 * @param {{file: string, slug: string}[]} manifest
 * @returns {Map<string, object>}
 */
export function buildManifestIndex(manifest) {
  const bySlug = new Map();
  for (const entry of manifest) {
    bySlug.set(entry.slug, entry);
  }
  return bySlug;
}

/**
 * Rewrites a single link href per Task 2.2's rules:
 * - absolute http(s):// links: untouched.
 * - bare `#anchor` links: untouched.
 * - relative `*.md` links (optionally with `#fragment`): rewritten to
 *   `/docs/<slug>/` (or `/docs/<slug>/#fragment`), where `<slug>` comes from the manifest.
 *   Throws if the target `.md` file is not in the manifest (index.md).
 * - anything else (mailto:, other relative non-md paths): left untouched, since the doc
 *   set has none of these today and inventing a policy for them is out of scope here.
 *
 * @param {string} href
 * @param {Map<string, object>} manifestBySlug
 * @param {{file?: string, linkText?: string}} [context] Used only for the error message.
 * @returns {string}
 */
export function rewriteLink(href, manifestBySlug, context = {}) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('#')) return href;

  const hashIndex = href.indexOf('#');
  const target = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : href.slice(hashIndex + 1);

  if (!/\.md$/i.test(target)) {
    return href;
  }

  const slug = target.slice(0, -3);
  if (!manifestBySlug.has(slug)) {
    const location = context.file ? context.file : '(unknown file)';
    const label = context.linkText ? ` (link text: "${context.linkText}")` : '';
    throw new Error(
      `inline: ${location}: link target "${target}"${label} does not match any ` +
        `entry in index.md's manifest`
    );
  }

  return fragment ? `/docs/${slug}/#${fragment}` : `/docs/${slug}/`;
}

/**
 * Creates a markdown-it instance configured for this converter:
 * - HTML passthrough enabled (`html: true`) — required so the one `<!-- embed: URL -->` marker
 *   in `overview.md` (Update 2026-08-10, "one video embed, overview.md only") tokenizes as an
 *   `html_block` for lib/convert.mjs to recognize, rather than being swallowed into a paragraph's
 *   inline content. Verified safe for the rest of the doc set: every other raw `<`/`>` in any of
 *   the 18 files lives inside a fenced code block or inline code span (both escaped independently
 *   of this option), and no other line anywhere starts with `<` at the block level.
 * - `breaks: false` (default) — a two-space trailing line break still produces a hard break token;
 *   a single newline stays a soft break.
 * - `hardbreak` overridden to emit a bare `<br>` with no trailing newline — markdown-it's default
 *   rule emits `<br>\n`, but every live page has `<br>` directly followed by the next text on the
 *   same line (verified against the `overview`, `usage`, `infrastructure` and `composer-usage`
 *   pages' live doc-page post_content on starter-kit.loc, captured 2026-08-10 — the live site and
 *   the skt/v1/serialize-blocks endpoint are the authority), so the default's trailing newline
 *   would be a byte-level mismatch.
 * - `link_open` overridden to rewrite relative `*.md` links via {@link rewriteLink}.
 *
 * The block-level walker (lib/convert.mjs) is expected to set `env.file` to the current
 * source file's relative path before rendering any inline tokens from it, so link-rewrite
 * errors can name the offending file.
 *
 * @param {{file: string, slug: string}[]} manifest
 * @returns {import('markdown-it')}
 */
export function createMarkdownIt(manifest) {
  const md = new MarkdownIt({ html: true, linkify: false, breaks: false, xhtmlOut: false });
  const manifestBySlug = buildManifestIndex(manifest);

  // Emit a bare `<br>` with no trailing newline (see createMarkdownIt's doc comment above) —
  // markdown-it's default hardbreak rule is `(options.xhtmlOut ? '<br />' : '<br>') + '\n'`.
  md.renderer.rules.hardbreak = function (tokens, idx, options) {
    return options.xhtmlOut ? '<br />' : '<br>';
  };

  // Escape only `&`, `<`, `>` in plain text tokens — the minimum needed for text placed inside
  // an HTML text node (`<p>`, `<li>`, `<h*>`, `<blockquote><p>`, etc.). markdown-it's default
  // `text` rule instead calls `md.utils.escapeHtml`, which also escapes `"` and `'` (correct for
  // attribute values, wrong here): live pages have e.g. `"Switch Theme Version for Dev
  // Environment"` verbatim in body text, not `&quot;Switch Theme Version for Dev
  // Environment&quot;`. Mirrors lib/convert.mjs's `escapeCodeText` for the same reason. This does
  // not affect attribute-value escaping (e.g. link `href`s) — that goes through
  // `Renderer.prototype.renderAttrs`, which calls the imported `escapeHtml` utility directly, not
  // through `renderer.rules.text`.
  md.renderer.rules.text = function (tokens, idx) {
    return tokens[idx].content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
      const href = token.attrs[hrefIndex][1];
      const linkText = tokens[idx + 1]?.content;
      token.attrs[hrefIndex][1] = rewriteLink(href, manifestBySlug, {
        file: env?.file,
        linkText,
      });
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return md;
}

/**
 * Renders one inline-container token's children (a `paragraph_open ... inline ... `-style
 * `inline` token) to an HTML string, applying inline formatting (`<strong>`, `<em>`,
 * `<code>`, `<a>`), entity escaping, and link rewriting.
 *
 * @param {import('markdown-it')} md
 * @param {import('markdown-it/lib/token.mjs').default} inlineToken A token with `.type === 'inline'`.
 * @param {{file?: string}} [env]
 * @returns {string}
 */
export function renderInline(md, inlineToken, env = {}) {
  return md.renderer.renderInline(inlineToken.children, md.options, env);
}
