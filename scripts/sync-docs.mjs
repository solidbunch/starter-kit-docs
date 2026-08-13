#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest } from './lib/manifest.mjs';
import { convertFile } from './lib/convert.mjs';
import { readMap, writeMap } from './lib/map.mjs';
import {
  readEnvCredentials,
  createWpClient,
  syncPage,
  draftRemovedPages,
} from './lib/wp.mjs';
import { serializeBlocks } from './lib/serialize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const mapPath = path.join(__dirname, 'docs-sync-map.json');
const outDir = path.join(repoRoot, '.sync-output');

const USAGE = `Usage: node sync-docs.mjs [--dry-run] [--strict] [--frozen-map] [--help]

Converts every *.md file listed in index.md into starter-kit/* (and core/*) block node trees,
serializes each one into Gutenberg block markup via WP_BASE_URL's REST API
(POST skt/v1/serialize-blocks), and publishes it to the /skt/v1/doc-page endpoint.

Options:
  --dry-run     Write serialized markup to .sync-output/<slug>.html and diff it against the live
                page's content.raw (?context=edit). Never calls a write endpoint.
  --strict      Treat converter warnings (e.g. an ordered list split by a nested code block) as
                fatal: exit non-zero if any warning was emitted. Checked before any network call.
  --frozen-map  Never write docs-sync-map.json. If the run adopted or created entries that would
                otherwise have been persisted, print a notice per entry instead of writing the
                file and continue — never a failure. Intended for CI, where the map is not
                committed back (see scripts/README.md, "Publishing from CI").
  --help        Print this message and exit 0.

Required environment variables (needed even for --dry-run: markup is no longer generated locally,
it is serialized by a live WordPress endpoint):
  WP_BASE_URL   e.g. http://starter-kit.loc
  WP_USER       docs-publisher user login
  WP_APP_PASSWORD   that user's Application Password (spaces included or stripped, both work)

See scripts/README.md for the full walkthrough.
`;

function parseArgs(argv) {
  const args = { dryRun: false, strict: false, frozenMap: false, help: false };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--frozen-map') args.frozenMap = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else {
      throw new Error(`sync-docs: unrecognized argument "${arg}" (see --help)`);
    }
  }
  return args;
}

function unifiedDiff(before, after, label) {
  // Minimal line-based diff — good enough for a human review of generated markup; not meant
  // to be a general-purpose diff algorithm.
  const beforeLines = (before ?? '').split('\n');
  const afterLines = (after ?? '').split('\n');
  if (before === after) return `  (no change)\n`;
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const out = [`--- live/${label}`, `+++ generated/${label}`];
  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) continue;
    if (b !== undefined) out.push(`- ${b}`);
    if (a !== undefined) out.push(`+ ${a}`);
  }
  return out.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  // Credential reading and client construction happen before conversion (serialization needs
  // the client), but neither does any network I/O by itself — so the --strict warnings check
  // below still runs, and can still abort, before the first actual network call.
  const credentials = readEnvCredentials();
  const client = createWpClient(credentials);

  const indexMdPath = path.join(repoRoot, 'index.md');
  const manifest = parseManifest(readFileSync(indexMdPath, 'utf8'), { repoRoot });

  const converted = [];
  const allWarnings = [];
  for (const entry of manifest) {
    const source = readFileSync(path.join(repoRoot, entry.file), 'utf8');
    const { blocks, warnings } = convertFile({ file: entry.file, source, manifest });
    converted.push({ ...entry, blocks });
    for (const w of warnings) {
      console.warn(`WARN ${w}`);
      allWarnings.push(w);
    }
  }

  if (args.strict && allWarnings.length > 0) {
    console.error(`sync-docs: --strict set and ${allWarnings.length} warning(s) were emitted; aborting.`);
    process.exit(1);
  }

  const map = readMap(mapPath, credentials.baseUrl);
  const mapSnapshotBeforeRun = structuredClone(map.pages);

  // Serialize each file's node tree into markup via the live endpoint — one POST per file
  // (the first network calls this run makes). A failure here is scoped to that one file: it is
  // reported, counted as failed, and the file is skipped entirely for the rest of the run —
  // never published with empty or partial content. A 400 means a bug in the node tree; the
  // endpoint's own path-named message is surfaced verbatim (see serialize.mjs). 401/403 are
  // already handled by wp.mjs's own error messages.
  const serialized = [];
  const serializeFailures = [];
  for (const entry of converted) {
    try {
      const html = await serializeBlocks(client, entry.blocks);
      serialized.push({ ...entry, html });
    } catch (err) {
      console.log(`✗ failed: ${entry.slug}: ${err.message}`);
      serializeFailures.push({
        file: entry.file,
        slug: entry.slug,
        id: map.pages[entry.file]?.id ?? null,
        action: 'failed',
        error: err.message,
      });
    }
  }

  if (args.dryRun) {
    mkdirSync(outDir, { recursive: true });
    let failures = serializeFailures.length;
    for (const entry of serialized) {
      writeFileSync(path.join(outDir, `${entry.slug}.html`), entry.html);

      let liveContent = '';
      let fetchError = null;
      const mapEntry = map.pages[entry.file];
      if (mapEntry) {
        try {
          const live = await client.request(`doc-page/${mapEntry.id}?context=edit`);
          liveContent = live?.content?.raw ?? '';
        } catch (err) {
          fetchError = err.message;
        }
      }

      if (fetchError) {
        console.log(`✗ ${entry.slug}: could not fetch live content for diff: ${fetchError}`);
        failures++;
        continue;
      }

      console.log(`--- ${entry.slug} ---`);
      process.stdout.write(unifiedDiff(liveContent, entry.html, `${entry.slug}.html`));
    }
    console.log(
      `\ndry-run: wrote ${serialized.length} file(s) to .sync-output/, issued zero write requests.`
    );
    process.exit(failures > 0 ? 1 : 0);
  }

  const results = [];
  for (const entry of serialized) {
    const result = await syncPage(client, map, {
      file: entry.file,
      slug: entry.slug,
      title: entry.title,
      order: entry.order,
      html: entry.html,
    });
    results.push(result);

    if (result.action === 'created') console.log(`✓ created  ${result.slug} (#${result.id})`);
    else if (result.action === 'updated') console.log(`✓ updated  ${result.slug} (#${result.id})`);
    else if (result.action === 'unchanged') console.log(`· unchanged ${result.slug} (#${result.id})`);
    else console.log(`✗ failed: ${result.slug}: ${result.error}`);
  }

  const manifestFiles = new Set(manifest.map((e) => e.file));
  const draftResults = await draftRemovedPages(client, map, manifestFiles);
  for (const result of draftResults) {
    if (result.action === 'drafted') console.log(`✓ drafted  ${result.slug} (#${result.id}) — no longer in index.md`);
    else console.log(`✗ failed to draft ${result.slug} (#${result.id}): ${result.error}`);
  }

  if (args.frozenMap) {
    for (const [file, entry] of Object.entries(map.pages)) {
      const before = mapSnapshotBeforeRun[file];
      if (!before || before.id !== entry.id || before.slug !== entry.slug) {
        console.log(`note: map entry ${file} → #${entry.id} was not persisted (--frozen-map)`);
      }
    }
  } else {
    writeMap(mapPath, credentials.baseUrl, map);
    console.log(`\nWrote ${mapPath} — commit this if it changed (git diff scripts/docs-sync-map.json).`);
  }

  const failed = [...results, ...draftResults, ...serializeFailures].filter((r) => r.action === 'failed');
  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const unchanged = results.filter((r) => r.action === 'unchanged').length;
  const drafted = draftResults.filter((r) => r.action === 'drafted').length;

  console.log(
    `\nSummary: ${created} created, ${updated} updated, ${unchanged} unchanged, ${drafted} drafted, ${failed.length} failed.`
  );

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`sync-docs: ${err.message}`);
  process.exit(1);
});
