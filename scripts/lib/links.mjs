import { readFileSync } from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

import { parseManifest } from './manifest.mjs';

/**
 * Link and anchor check for the doc pages named by `index.md` (plus `index.md` itself).
 * Every relative `*.md` link must resolve to a page of the docs root and, when it has a
 * `#fragment`, the fragment must match a heading slug of the target. A bare `#fragment` is checked
 * against the same file. External links (anything with a scheme) and non-Markdown targets are
 * ignored. Filesystem reads only.
 */

const EXTERNAL_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * GitHub-style heading slug: lowercase, keep letters, digits, space, `-` and `_`, spaces to `-`.
 * Emoji and variation selectors drop out, which can leave a leading `-`.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

/** Leading hyphens are not significant when comparing (emoji headings, see `slugify`). */
function normalizeSlug(slug) {
  return slug.replace(/^-+/, '');
}

/** Plain text of an inline token: text and code spans, breaks as a space. */
function inlineText(token) {
  let out = '';
  for (const child of token.children ?? []) {
    if (child.type === 'text' || child.type === 'code_inline') out += child.content;
    else if (child.type === 'softbreak' || child.type === 'hardbreak') out += ' ';
  }
  return out;
}

/** Page list: `index.md` first, then every TOC entry's file. Throws like `parseManifest()`. */
export function listPages(docsRoot) {
  const manifest = parseManifest(readFileSync(path.join(docsRoot, 'index.md'), 'utf8'), {
    repoRoot: docsRoot,
  });
  return ['index.md', ...manifest.map((m) => m.file)];
}

/**
 * Parse one page: its heading slugs (duplicates get `-1`, `-2`) and its link targets with lines.
 *
 * @returns {{slugs: Set<string>, links: {href: string, line: number}[]}}
 */
function parsePage(md, source) {
  const tokens = md.parse(source, {});
  const slugs = new Set();
  const seen = new Map();
  const links = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const base = slugify(inlineText(tokens[i + 1]));
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      slugs.add(normalizeSlug(n === 0 ? base : `${base}-${n}`));
    }
    if (t.type !== 'inline') continue;
    let line = (t.map?.[0] ?? 0) + 1;
    for (const child of t.children ?? []) {
      if (child.type === 'softbreak' || child.type === 'hardbreak') line += 1;
      if (child.type === 'link_open') {
        const href = child.attrGet('href');
        if (href) links.push({ href, line });
      }
    }
  }
  return { slugs, links };
}

/**
 * @param {string} docsRoot
 * @returns {{problems: string[], linkCount: number, anchorCount: number}}
 */
export function checkLinks(docsRoot) {
  const pages = listPages(docsRoot);
  const md = new MarkdownIt();
  const parsed = new Map();
  const problems = [];
  let linkCount = 0;
  let anchorCount = 0;

  for (const file of pages) {
    try {
      parsed.set(file, parsePage(md, readFileSync(path.join(docsRoot, file), 'utf8')));
    } catch (err) {
      problems.push(`${file}: ${err.message}`);
    }
  }

  // A link may name an existing page that index.md does not list; parse it once, on demand.
  const parseOnDemand = (file) => {
    try {
      const page = parsePage(md, readFileSync(path.join(docsRoot, file), 'utf8'));
      parsed.set(file, page);
      return page;
    } catch {
      return undefined;
    }
  };

  for (const [file, page] of [...parsed]) {
    for (const { href, line } of page.links) {
      if (EXTERNAL_RE.test(href) || href.startsWith('//')) continue;
      const hashAt = href.indexOf('#');
      const targetPart = (hashAt === -1 ? href : href.slice(0, hashAt)).split('?')[0];
      let fragment = hashAt === -1 ? null : href.slice(hashAt + 1);
      if (targetPart !== '' && !targetPart.endsWith('.md')) continue;

      const targetFile = targetPart === '' ? file : path.posix.normalize(targetPart);
      linkCount += 1;
      const target = parsed.get(targetFile) ?? parseOnDemand(targetFile);
      if (!target) {
        problems.push(`${file}:${line} → ${href} (file not found)`);
        continue;
      }
      if (fragment === null || fragment === '') continue;
      anchorCount += 1;
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        // keep the raw fragment
      }
      if (!target.slugs.has(normalizeSlug(fragment.toLowerCase()))) {
        problems.push(`${file}:${line} → ${href} (anchor not found)`);
      }
    }
  }

  return { problems, linkCount, anchorCount };
}
