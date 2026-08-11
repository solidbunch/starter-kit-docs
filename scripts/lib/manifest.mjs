import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');

const TOC_HEADING = '## Table of Contents';
const LIST_ITEM_RE = /^(\d+)\.\s+\[(.+?)\]\(([^)]+)\)\s*$/;

/**
 * Parses index.md's ordered Table of Contents list into the manifest contract:
 * [{ order, title, file, slug }], in document order.
 *
 * Rules (per architect-plan-docs-sync-script-stage1.md, Task 2.1):
 * - Ignores the "## Table of Contents" heading itself.
 * - Ignores trailing whitespace, including a two-space Markdown hard break
 *   (index.md's last TOC line has one).
 * - Fails loudly (throws) if any entry's href is not a bare `*.md` filename in
 *   the repo root, or if the referenced file does not exist on disk.
 *
 * @param {string} indexMdSource Raw contents of index.md.
 * @param {object} [options]
 * @param {string} [options.repoRoot] Repo root to resolve/verify `*.md` files against.
 * @param {boolean} [options.checkFilesExist=true] Set false to skip the disk-existence check
 *   (useful for unit tests that don't want a real repo checkout).
 * @returns {{order: number, title: string, file: string, slug: string}[]}
 */
export function parseManifest(indexMdSource, options = {}) {
  const { repoRoot = DEFAULT_REPO_ROOT, checkFilesExist = true } = options;

  const lines = indexMdSource.split(/\r\n|\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === TOC_HEADING);
  if (headingIndex === -1) {
    throw new Error(
      `manifest: could not find a "${TOC_HEADING}" heading in index.md`
    );
  }

  const entries = [];

  for (let i = headingIndex + 1; i < lines.length; i++) {
    // Trailing whitespace, including a two-space hard break, is not
    // significant to list-item parsing.
    const rawLine = lines[i];
    const line = rawLine.replace(/\s+$/, '');
    if (line === '') continue;

    const match = line.match(LIST_ITEM_RE);
    if (!match) {
      throw new Error(
        `manifest: index.md:${i + 1}: expected an ordered-list entry like ` +
          `"1. [Title](file.md)", got: ${JSON.stringify(rawLine)}`
      );
    }

    const [, orderStr, title, href] = match;
    const order = Number(orderStr);

    if (!/^[^/\\]+\.md$/.test(href)) {
      throw new Error(
        `manifest: index.md:${i + 1}: link target ${JSON.stringify(href)} ` +
          `for "${title}" is not a bare *.md filename in the repo root`
      );
    }

    const file = href;
    const slug = file.slice(0, -3);

    if (checkFilesExist && !existsSync(path.join(repoRoot, file))) {
      throw new Error(
        `manifest: index.md:${i + 1}: "${file}" (linked from "${title}") ` +
          `does not exist in the repo root (${repoRoot})`
      );
    }

    entries.push({ order, title, file, slug });
  }

  return entries;
}
