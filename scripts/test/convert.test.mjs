import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest } from '../lib/manifest.mjs';
import { convertFile } from '../lib/convert.mjs';
import * as B from '../lib/blocks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const indexMd = readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
const manifest = parseManifest(indexMd, { repoRoot });

/**
 * `convertFile()` returns `{slug, blocks, warnings}` where `blocks` is a tree of
 * `{blockName, attrs, innerBlocks, innerHTML}` node objects (Task 1.2). These helpers walk that
 * tree — recursing into `innerBlocks` — to find nodes for assertion, replacing the old
 * markup-string regex matching against a `.html` field `convertFile()` no longer returns.
 */
function flattenNodes(nodes) {
  const result = [];
  for (const node of nodes) {
    result.push(node);
    if (node.innerBlocks && node.innerBlocks.length) {
      result.push(...flattenNodes(node.innerBlocks));
    }
  }
  return result;
}

function collectByBlockName(nodes, blockName) {
  return flattenNodes(nodes).filter((n) => n.blockName === blockName);
}

test('convertFile skips the document\'s title heading (level 1) and still converts subsequent headings', () => {
  const file = 'overview.md';
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const { blocks } = convertFile({ file, source, manifest });

  // "Overview" is the level-1 title heading (`# Overview`) — matches post_title, must not appear
  // as a starter-kit/heading block.
  const headings = collectByBlockName(blocks, 'starter-kit/heading');
  for (const h of headings) {
    assert.ok(
      !h.innerHTML.includes('Overview'),
      `expected no starter-kit/heading block to contain "Overview", but found:\n${JSON.stringify(h)}`
    );
  }

  // "Main Goals" is the next heading in the file (`## Main Goals`) — must still be converted
  // normally.
  const mainGoals = headings.find((h) => h.innerHTML === '\n<h2>Main Goals</h2>\n');
  assert.ok(mainGoals, 'expected a starter-kit/heading node for "Main Goals"');
  assert.deepEqual(mainGoals.attrs, {});
});

test('convertFile converts overview.md\'s "<!-- embed: URL -->" marker into the row/column/embed block, matching B.embed()', () => {
  const file = 'overview.md';
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const { blocks } = convertFile({ file, source, manifest });

  const rows = collectByBlockName(blocks, 'starter-kit/row');
  assert.equal(rows.length, 1, 'expected exactly one starter-kit/row node');
  assert.deepEqual(rows[0], B.embed('https://youtu.be/uCQcxhVUsdc'));
});

test('convertFile emits code-fence content with " left literal, not escaped to &quot; (composer-usage.md installer-paths sample, matches live)', () => {
  const file = 'composer-usage.md';
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const { blocks } = convertFile({ file, source, manifest });

  const codeBlocks = collectByBlockName(blocks, 'starter-kit/code');
  const installerPaths = codeBlocks.find((n) => n.innerHTML.includes('"installer-paths": {'));
  assert.ok(installerPaths, 'expected a starter-kit/code node containing the installer-paths sample');
  assert.equal(installerPaths.attrs.language, 'json');
  assert.match(installerPaths.innerHTML, /<code class="language-json">"installer-paths": \{/);

  for (const n of codeBlocks) {
    assert.doesNotMatch(n.innerHTML, /&quot;installer-paths&quot;/);
  }
});

test('convertFile emits hard breaks as a bare <br> with no trailing newline (overview.md, matches live byte-for-byte)', () => {
  const file = 'overview.md';
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const { blocks } = convertFile({ file, source, manifest });

  const expected = 'built for rapid project initiation.<br>It provides a <strong>preconfigured Docker-based infrastructure</strong>';
  const nodes = flattenNodes(blocks);
  const matching = nodes.find((n) => n.innerHTML.includes(expected));
  assert.ok(matching, `expected a node whose innerHTML contains:\n${expected}`);

  for (const n of nodes) {
    assert.doesNotMatch(n.innerHTML, /<br>\n/);
  }
});

test('convertFile skips the document\'s title heading (level 2) and still converts subsequent headings', () => {
  const file = 'advanced-installation-options.md';
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const { blocks } = convertFile({ file, source, manifest });

  // "Advanced Installation Options" is the title heading (`## Advanced Installation Options`,
  // level 2 — this file is one of the two that don't open with `#`) — matches post_title, must
  // not appear as a starter-kit/heading block.
  const headings = collectByBlockName(blocks, 'starter-kit/heading');
  for (const h of headings) {
    assert.ok(
      !h.innerHTML.includes('Advanced Installation Options'),
      `expected no starter-kit/heading block to contain "Advanced Installation Options", but found:\n${JSON.stringify(h)}`
    );
  }

  // The next heading in the file is level 3 (`### 1. Scaffold a New GitHub Repository
  // (Template)`) — must still be converted normally, proving the skip is positional (first
  // heading token only), not level-based.
  const scaffold = headings.find(
    (h) => h.innerHTML === '\n<h3>1. Scaffold a New GitHub Repository (Template)</h3>\n'
  );
  assert.ok(scaffold, 'expected a starter-kit/heading node for "1. Scaffold a New GitHub Repository (Template)"');
  assert.deepEqual(scaffold.attrs, { level: 3 });
});

test('convertFile splits an ordered list around a nested fenced code block into sibling core/list / starter-kit/code / core/list nodes, and logs a matching warning (ai-assisted-development.md "Bootstrapping" section)', () => {
  const file = 'ai-assisted-development.md';
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const { blocks, warnings } = convertFile({ file, source, manifest });

  const startIndex = blocks.findIndex(
    (b) => b.blockName === 'starter-kit/heading' && b.innerHTML.includes('Bootstrapping a new project')
  );
  assert.notEqual(startIndex, -1, 'expected to find the "Bootstrapping a new project" heading');

  // The section's numbered list is interrupted twice by a fenced code block (the "git clone"
  // step and the "claude" step), splitting one logical <ol> into three sibling core/list nodes
  // with starter-kit/code nodes in between, at the same (top-level) sibling position.
  const sequence = blocks
    .slice(startIndex + 1, startIndex + 8)
    .map((b) => b.blockName);
  assert.deepEqual(sequence, [
    'core/paragraph',
    'core/list',
    'starter-kit/code',
    'core/list',
    'starter-kit/code',
    'core/list',
    'core/separator',
  ]);

  const [firstList, firstCode, secondList, secondCode, thirdList] = blocks.slice(
    startIndex + 2,
    startIndex + 7
  );
  assert.equal(firstList.attrs.ordered, true);
  assert.equal(firstCode.attrs.language, 'bash');
  assert.match(firstCode.innerHTML, /git clone https:\/\/github\.com\/solidbunch\/starter-kit-foundation\.git my-project/);
  assert.equal(secondList.attrs.ordered, true);
  assert.equal(secondCode.attrs.language, 'bash');
  assert.match(secondCode.innerHTML, /<code class="language-bash">claude<\/code>/);
  assert.equal(thirdList.attrs.ordered, true);

  assert.deepEqual(warnings, [
    'ai-assisted-development.md:75 ordered list split by nested code block; numbering restarts',
    'ai-assisted-development.md:82 ordered list split by nested code block; numbering restarts',
  ]);
});
