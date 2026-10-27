import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseManifest } from './manifest.mjs';
import { convertFile } from './convert.mjs';

/**
 * Title drift: does every `index.md` TOC entry's link text match the linked file's own
 * `# heading`? Shared by `check-title-drift.mjs` (pre-commit) and `make-doc-gate.mjs`. Reuses
 * `sync-docs.mjs`'s own Decision 4 drift check so the two never silently diverge; runs offline,
 * `convertFile()` only parses Markdown locally.
 *
 * Also returns the converter warnings from every `convertFile()` call (the pre-commit checker
 * discards them; the gate compares them with a saved baseline).
 *
 * Throws (like `parseManifest()`) when `index.md` is missing or malformed.
 *
 * @param {string} docsRoot Directory holding `index.md` and the doc pages.
 * @returns {{problems: string[], warnings: string[], entryCount: number}}
 */
export function findTitleDrift(docsRoot) {
  const manifest = parseManifest(readFileSync(path.join(docsRoot, 'index.md'), 'utf8'), {
    repoRoot: docsRoot,
  });

  const problems = [];
  const warnings = [];

  for (const entry of manifest) {
    let title;
    try {
      const source = readFileSync(path.join(docsRoot, entry.file), 'utf8');
      const converted = convertFile({ file: entry.file, source, manifest });
      title = converted.title;
      warnings.push(...converted.warnings);
    } catch (err) {
      problems.push(`${entry.file}: ${err.message}`);
      continue;
    }

    if (title !== entry.tocTitle) {
      problems.push(
        `index.md:${entry.line} TOC text "${entry.tocTitle}" does not match ${entry.file}'s own ` +
          `title heading "${title}" — the file's heading is the published title; update index.md`
      );
    }
  }

  return { problems, warnings, entryCount: manifest.length };
}
