import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest } from '../lib/manifest.mjs';
import { convertFile } from '../lib/convert.mjs';
import { readEnvCredentials, createWpClient } from '../lib/wp.mjs';
import { serializeBlocks } from '../lib/serialize.mjs';

/**
 * Task 3.1 — credentials-gated integration test.
 *
 * For each of the 17 `fixtures/live-reference/*.html` fixtures (one per already-published
 * `doc-page`; the 18th manifest entry, `ai-assisted-development.md`, has no live post yet and no
 * fixture, and is deliberately excluded here), builds the corresponding `.md` file's node tree
 * via `convertFile()`, POSTs it to the live `skt/v1/serialize-blocks` endpoint via
 * `serializeBlocks()`, and byte-compares the returned markup against the fixture file.
 *
 * The fixture files were scraped from a live page and, as scraped, end with a single trailing
 * newline that is a property of the scraped file on disk — not a property of `post_content`
 * (`syncPage()` never appends one; see `wp.mjs`). Exactly one trailing `\n` is stripped from the
 * fixture side of the comparison before comparing; the endpoint's returned markup is compared
 * as-is, unmodified.
 *
 * Per the plan's "Loss of offline markup verification" risk note: this is the *only* place left
 * in the suite that verifies real serialized byte shapes at all post-migration. An offline
 * `npm test` run no longer proves the sync will produce correct markup — that guarantee now
 * lives here, and only runs with live credentials.
 *
 * Requires WP_BASE_URL / WP_USER / WP_APP_PASSWORD (see scripts/README.md's Prerequisites
 * section). Skips — never silently passes — when they are absent.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'live-reference');

const indexMd = readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
const manifest = parseManifest(indexMd, { repoRoot });

// Fixture basename -> source .md filename. Identity in every case except one: the live post's
// slug (and thus the scraped fixture's filename) is `https-local-certificates`, but the manifest
// entry (and the file on disk) is `https-and-local-certificates.md` — see scripts/README.md's
// note on this slug override, and docs-sync-map.json's identity map for the same page.
const FIXTURE_TO_MD_FILE = {
  'https-local-certificates': 'https-and-local-certificates.md',
};

function mdFileForFixture(fixtureBasename) {
  return FIXTURE_TO_MD_FILE[fixtureBasename] ?? `${fixtureBasename}.md`;
}

/**
 * Finds the first byte offset at which `a` and `b` diverge (or the shorter length if one is a
 * strict prefix of the other), and formats a message with ~20 bytes of surrounding context from
 * both sides.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function describeFirstDifference(a, b) {
  const minLen = Math.min(a.length, b.length);
  let offset = 0;
  while (offset < minLen && a[offset] === b[offset]) {
    offset++;
  }

  const contextRadius = 20;
  const start = Math.max(0, offset - contextRadius);
  const aContext = a.slice(start, offset + contextRadius);
  const bContext = b.slice(start, offset + contextRadius);

  if (offset >= minLen) {
    return (
      `strings are identical up to offset ${offset} but differ in length ` +
      `(expected ${a.length} bytes, got ${b.length} bytes)\n` +
      `  expected (tail): ${JSON.stringify(a.slice(start))}\n` +
      `  actual   (tail): ${JSON.stringify(b.slice(start))}`
    );
  }

  return (
    `first differing byte at offset ${offset}\n` +
    `  expected: ${JSON.stringify(aContext)}\n` +
    `  actual:   ${JSON.stringify(bContext)}`
  );
}

const fixtureFiles = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.html'))
  .sort();

let credentials = null;
let skipReason = null;
try {
  credentials = readEnvCredentials();
} catch (err) {
  skipReason =
    'skipping serialize.integration.test.mjs: WP_BASE_URL / WP_USER / WP_APP_PASSWORD are not ' +
    `all set (${err.message}). This test round-trips markup against the live ` +
    'skt/v1/serialize-blocks endpoint and cannot run offline — see scripts/README.md\'s ' +
    'Prerequisites section to export them.';
}

const client = credentials ? createWpClient(credentials) : null;

for (const fixtureFile of fixtureFiles) {
  const fixtureBasename = fixtureFile.slice(0, -'.html'.length);
  const mdFile = mdFileForFixture(fixtureBasename);

  test(`serialize-blocks round-trip: ${mdFile} matches fixtures/live-reference/${fixtureFile}`, { skip: skipReason ?? false }, async () => {
    const manifestEntry = manifest.find((m) => m.file === mdFile);
    assert.ok(manifestEntry, `expected ${mdFile} to be present in index.md's manifest`);

    const source = readFileSync(path.join(repoRoot, mdFile), 'utf8');
    const { blocks, warnings } = convertFile({ file: mdFile, source, manifest });
    assert.deepEqual(warnings, [], `expected no converter warnings for ${mdFile}`);

    const markup = await serializeBlocks(client, blocks);

    const fixtureRaw = readFileSync(path.join(fixturesDir, fixtureFile), 'utf8');
    assert.ok(
      fixtureRaw.endsWith('\n'),
      `expected ${fixtureFile} to end with a trailing newline (scrape artifact) to strip`
    );
    const expected = fixtureRaw.slice(0, -1);

    assert.equal(
      markup,
      expected,
      `${mdFile} did not byte-match ${fixtureFile}:\n${describeFirstDifference(expected, markup)}`
    );
  });
}
