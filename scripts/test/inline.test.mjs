import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMarkdownIt,
  renderInline,
  rewriteLink,
  buildManifestIndex,
  inlineToPlainText,
} from '../lib/inline.mjs';

const manifest = [
  { file: 'overview.md', slug: 'overview' },
  { file: 'platform-notes.md', slug: 'platform-notes' },
  { file: 'advanced-installation-options.md', slug: 'advanced-installation-options' },
  { file: 'installation.md', slug: 'installation' },
];

function renderLine(md, line, env = {}) {
  const tokens = md.parse(line, env);
  const inline = tokens.find((t) => t.type === 'inline');
  return renderInline(md, inline, env);
}

test('renders installation.md:11 — emoji prose, a nested link, and an external link untouched', () => {
  const md = createMarkdownIt(manifest);
  const line =
    '🖥️ **Supported Platforms:** macOS, Linux, and Windows (with [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install)). See [Platform Notes](platform-notes.md) for details.';
  const html = renderLine(md, line, { file: 'installation.md' });
  assert.match(html, /<strong>Supported Platforms:<\/strong>/);
  assert.match(html, /<a href="https:\/\/learn\.microsoft\.com\/en-us\/windows\/wsl\/install">WSL2<\/a>/);
  assert.match(html, /<a href="\/docs\/platform-notes\/">Platform Notes<\/a>/);
});

test('renders installation.md:15 — relative .md link rewritten to /docs/<slug>/', () => {
  const md = createMarkdownIt(manifest);
  const line =
    "⚡️ Looking to scaffold a new WordPress project, not just clone this StarterKit? See: [Advanced Installation Options](advanced-installation-options.md). You'll generate your own repository with independent Git history and configuration — a clean foundation ready to customize and deploy.";
  const html = renderLine(md, line, { file: 'installation.md' });
  assert.match(
    html,
    /<a href="\/docs\/advanced-installation-options\/">Advanced Installation Options<\/a>/
  );
});

test('overview.md:34 — bare "&" is escaped to &amp;', () => {
  const md = createMarkdownIt(manifest);
  const line =
    '**Open-source & extensible** – Distributed under the MIT license and structured for community contributions.';
  const html = renderLine(md, line, { file: 'overview.md' });
  assert.match(html, /Open-source &amp; extensible/);
});

test('a relative .md link with a #fragment preserves the fragment', () => {
  const md = createMarkdownIt(manifest);
  const html = renderLine(md, '[see this](installation.md#section)', { file: 'overview.md' });
  assert.match(html, /<a href="\/docs\/installation\/#section">see this<\/a>/);
});

test('a bare #anchor link is left untouched', () => {
  const md = createMarkdownIt(manifest);
  const html = renderLine(md, '[jump](#top)', { file: 'overview.md' });
  assert.match(html, /<a href="#top">jump<\/a>/);
});

test('an invented link to a file absent from the manifest throws, naming file and link text', () => {
  const md = createMarkdownIt(manifest);
  assert.throws(
    () => renderLine(md, '[x](ghost.md)', { file: 'overview.md' }),
    (err) => {
      assert.match(err.message, /overview\.md/);
      assert.match(err.message, /ghost\.md/);
      assert.match(err.message, /"x"/);
      return true;
    }
  );
});

test('rewriteLink() directly: absolute http(s) links are untouched', () => {
  const idx = buildManifestIndex(manifest);
  assert.equal(rewriteLink('https://example.com/foo', idx), 'https://example.com/foo');
  assert.equal(rewriteLink('http://example.com/foo', idx), 'http://example.com/foo');
});

test('two trailing spaces produce a hard line break (<br>) with no trailing newline', () => {
  const md = createMarkdownIt(manifest);
  const html = renderLine(md, 'First line.  \nSecond line.', { file: 'overview.md' });
  assert.match(html, /First line\.<br>Second line\./);
  assert.doesNotMatch(html, /<br>\n/);
});

test('hard break matches the live shape from overview.md ("...built for rapid project initiation.<br>It provides a...")', () => {
  const md = createMarkdownIt(manifest);
  const line =
    '**StarterKit** is a baseline WordPress environment template built for rapid project initiation.  \nIt provides a **preconfigured Docker-based infrastructure**.';
  const html = renderLine(md, line, { file: 'overview.md' });
  assert.match(html, /built for rapid project initiation\.<br>It provides a/);
});

function inlineOf(md, line, env = {}) {
  const tokens = md.parse(line, env);
  return tokens.find((t) => t.type === 'inline');
}

test('inlineToPlainText() extracts plain text from a plain heading', () => {
  const md = createMarkdownIt(manifest);
  const inline = inlineOf(md, 'HTTPS & Local Certificates');
  assert.equal(inlineToPlainText(inline), 'HTTPS & Local Certificates');
});

test('inlineToPlainText() preserves raw "&" — never escapes to &amp;', () => {
  const md = createMarkdownIt(manifest);
  const inline = inlineOf(md, 'Open-source & extensible');
  assert.equal(inlineToPlainText(inline), 'Open-source & extensible');
});

test('inlineToPlainText() strips **bold** and `code` markup down to their plain text', () => {
  const md = createMarkdownIt(manifest);
  const inline = inlineOf(md, 'Some **bold** and `code` title');
  assert.equal(inlineToPlainText(inline), 'Some bold and code title');
});

test('inlineToPlainText() joins a hard-break heading with a single space', () => {
  const md = createMarkdownIt(manifest);
  const inline = inlineOf(md, 'First line.  \nSecond line.');
  assert.equal(inlineToPlainText(inline), 'First line. Second line.');
});

test('composer-usage.md:154 — a literal `"` in plain text renders as `"`, not `&quot;`, matching the live fixture', () => {
  const md = createMarkdownIt(manifest);
  const line =
    '**CI-only**: in DEV deploys (CI/CD) this command runs inside the Composer container to pin the theme to the `dev-develop` branch and refresh the lock. Production deployments use the default theme version from `composer.json` (`dev-master`). See `.github/workflows/job-deploy.yml` step "Switch Theme Version for Dev Environment".';
  const html = renderLine(md, line, { file: 'composer-usage.md' });
  const expected =
    '<strong>CI-only</strong>: in DEV deploys (CI/CD) this command runs inside the Composer container to pin the theme to the <code>dev-develop</code> branch and refresh the lock. Production deployments use the default theme version from <code>composer.json</code> (<code>dev-master</code>). See <code>.github/workflows/job-deploy.yml</code> step "Switch Theme Version for Dev Environment".';
  assert.equal(html, expected);
  assert.doesNotMatch(html, /&quot;/);
});
