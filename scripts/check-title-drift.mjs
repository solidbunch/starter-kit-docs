#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findTitleDrift } from './lib/title-drift.mjs';

/**
 * Offline pre-commit check: does every `index.md` TOC entry's link text match the linked file's
 * own `# heading`? Reuses `sync-docs.mjs`'s own Decision 4 drift check (see that file's
 * `if (title !== entry.tocTitle)` block) so the two never silently diverge, but runs standalone,
 * with no WP credentials and no network call — `convertFile()` only parses Markdown locally,
 * it never touches the `serialize-blocks` endpoint. The check itself lives in `lib/title-drift.mjs`.
 *
 * A file's `# heading` is the published `post_title` (see `manifest.mjs`'s docblock); `index.md`
 * only displays it. `git commit` should fail loudly the moment these disagree, rather than let
 * the next `npm run sync:dry`/live publish be the first place anyone notices — see
 * `environment-and-secrets.md`'s title edit landing without `index.md` being updated to match,
 * which is exactly the drift this script exists to catch before it's committed.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function main() {
  const { problems, entryCount } = findTitleDrift(repoRoot);

  if (problems.length > 0) {
    console.error(`check-title-drift: ${problems.length} title/TOC mismatch(es) found:\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nFix: edit index.md so each entry\'s link text matches the linked file\'s own heading.');
    process.exit(1);
  }

  console.log(`check-title-drift: all ${entryCount} index.md entries match their file's heading.`);
}

main();
