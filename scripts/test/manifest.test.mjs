import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest } from '../lib/manifest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const indexMd = readFileSync(path.join(repoRoot, 'index.md'), 'utf8');

test('parses all 18 index.md entries, in order, with matching slugs', () => {
  const manifest = parseManifest(indexMd, { repoRoot });
  assert.equal(manifest.length, 18);
  manifest.forEach((entry, i) => {
    assert.equal(entry.order, i + 1);
    assert.equal(entry.slug, entry.file.replace(/\.md$/, ''));
  });
  assert.equal(manifest[0].file, 'overview.md');
  assert.equal(manifest[17].file, 'troubleshooting.md');
});

test('preserves raw "&" in titles without escaping', () => {
  const manifest = parseManifest(indexMd, { repoRoot });
  const entry = manifest.find((m) => m.file === 'environment-and-secrets.md');
  assert.equal(entry.title, 'Environment & Secrets');
});

test('throws naming the offending line for a bogus link to a missing .md file', () => {
  const bogus = indexMd.replace(
    '18. [Troubleshooting](troubleshooting.md)',
    '18. [Troubleshooting](troubleshooting.md)\n19. [Bogus](nope.md)'
  );
  assert.throws(
    () => parseManifest(bogus, { repoRoot }),
    /index\.md:21:.*"nope\.md"/
  );
});

test('throws naming the offending line for a href that is not a bare *.md filename', () => {
  const bogus = indexMd.replace(
    '18. [Troubleshooting](troubleshooting.md)',
    '18. [Troubleshooting](troubleshooting.md)\n19. [Bogus](https://example.com/nope.md)'
  );
  assert.throws(
    () => parseManifest(bogus, { repoRoot }),
    /index\.md:21:.*not a bare \*\.md filename/
  );
});

test('throws if a listed .md file does not exist on disk', () => {
  const fake = '## Table of Contents\n\n1. [Ghost](ghost.md)\n';
  assert.throws(() => parseManifest(fake, { repoRoot }), /ghost\.md.*does not exist/);
});

test('checkFilesExist: false skips the disk-existence check (for isolated unit tests)', () => {
  const fake = '## Table of Contents\n\n1. [Ghost](ghost.md)\n';
  const manifest = parseManifest(fake, { checkFilesExist: false });
  assert.equal(manifest.length, 1);
  assert.equal(manifest[0].slug, 'ghost');
});
