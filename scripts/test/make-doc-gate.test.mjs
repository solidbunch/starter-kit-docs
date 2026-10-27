import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gate = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'make-doc-gate.mjs');

// Every fixture lives in a temp dir (a synthetic docs root and a mini foundation that is not a
// git repo; these tests never read the live foundation, the real docs or the real allowlist) and
// is removed in after().
const tmpDirs = [];
function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `make-doc-gate-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}
after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function write(root, rel, content = '') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const MAKEFILE = ['.SILENT:', '', 'install:', '\techo install', '%:', '\t@:', ''].join('\n');

function mkFoundation(envMain = 'APP_NAME=x\n') {
  const root = tmp('foundation');
  write(root, 'Makefile', MAKEFILE);
  write(root, 'sh/dev/run.sh', 'MODE="$1"\nSERVICE="$2"\nUSER="$3"\n');
  write(root, 'config/environment/.env.main', envMain);
  return root;
}

/** A docs root: `pages` maps file name to body; each page's title is `Page <name>`. */
function mkDocs(pages) {
  const root = tmp('docs');
  const names = Object.keys(pages);
  write(
    root,
    'index.md',
    ['# Docs', '', '## Table of Contents', '', ...names.map((n, i) => `${i + 1}. [Page ${n}](${n})`), ''].join('\n'),
  );
  for (const [name, body] of Object.entries(pages)) write(root, name, `# Page ${name}\n\n${body}\n`);
  return root;
}

const EMPTY_ALLOWLIST = '[allowed]\n\n[known-drift]\n';

function mkAllowlist(text = EMPTY_ALLOWLIST) {
  const root = tmp('allowlist');
  write(root, 'allow.txt', text);
  return path.join(root, 'allow.txt');
}

const SPLIT_LIST = ['1. Step one', '', '   ```bash', '   echo hi', '   ```', '', '2. Step two'].join('\n');

function runGate(docsRoot, args, { foundation = mkFoundation(), allowlist = mkAllowlist(), env = {} } = {}) {
  const childEnv = { ...process.env, FOUNDATION_PATH: foundation, ...env };
  delete childEnv.DOC_CLAIMS_REQUIRE_FOUNDATION;
  delete childEnv.MAKE_DOC_GATE_NODE_MODULES;
  Object.assign(childEnv, env);
  const r = spawnSync(
    process.execPath,
    [gate, `--docs-root=${docsRoot}`, `--allowlist=${allowlist}`, ...args],
    { env: childEnv, encoding: 'utf8' },
  );
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const init = (docsRoot, opts) => runGate(docsRoot, ['--init'], opts);
const compare = (docsRoot, opts, extra = []) => runGate(docsRoot, ['--compare-baseline', ...extra], opts);

test('links: a relative link to a missing file fails with file:line', () => {
  const docs = mkDocs({ 'a.md': 'Intro.\n\nSee [the other page](missing.md).' });
  init(docs);
  const r = compare(docs);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL links: a\.md:5 → missing\.md \(file not found\)$/m);
});

test('links: a missing anchor fails, existing anchors (incl. duplicate headings) pass', () => {
  const docs = mkDocs({
    'a.md': 'See [one](b.md#section-one), [again](b.md#section-one-1), [bad](b.md#nope), [self](#local).\n\n## Local',
    'b.md': '## Section One\n\ntext\n\n## Section One\n\ntext',
  });
  init(docs);
  const r = compare(docs);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL links: a\.md:3 → b\.md#nope \(anchor not found\)$/m);
  assert.doesNotMatch(r.stdout, /section-one/);
  assert.doesNotMatch(r.stdout, /#local/);
});

test('links: an emoji heading matches its slug with or without the leading hyphen', () => {
  const docs = mkDocs({
    'a.md': 'Go to [x](b.md#mariadb-troubleshooting) or [y](b.md#-mariadb-troubleshooting).',
    'b.md': '## 🛠️ MariaDB Troubleshooting\n\ntext',
  });
  init(docs);
  const r = compare(docs);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^PASS links: 4 links, 2 anchors$/m);
});

test('excluded-terms: "stripe" fails, "striped" does not', () => {
  const clean = mkDocs({ 'a.md': 'A striped table.' });
  init(clean);
  const ok = compare(clean);
  assert.match(ok.stdout, /^PASS excluded-terms$/m);

  const dirty = mkDocs({ 'a.md': 'Pay with Stripe.' });
  init(dirty);
  const r = compare(dirty);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL excluded-terms: a\.md:3 stripe$/m);
});

test('live-hosts: a subdomain fails, licensing and the bare host pass', () => {
  const ok = mkDocs({
    'a.md': 'Licensing: https://licensing.starter-kit.io/api and the site [starter-kit.io](https://starter-kit.io).',
  });
  init(ok);
  assert.match(compare(ok).stdout, /^PASS live-hosts$/m);

  const bad = mkDocs({ 'a.md': 'Open https://docs.starter-kit.io/x now.' });
  init(bad);
  const r = compare(bad);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL live-hosts: a\.md:3 https:\/\/docs\.starter-kit\.io\/x$/m);
});

test('converter: a new warning fails, a warning whose line only shifted is not new', () => {
  const docs = mkDocs({ 'a.md': SPLIT_LIST });
  const baseline = init(docs);
  assert.equal(baseline.status, 0, baseline.stdout);
  assert.match(baseline.stdout, /\(1 converter warnings\)/);

  write(docs, 'a.md', `# Page a.md\n\nA new paragraph shifts the list.\n\n${SPLIT_LIST}\n`);
  const shifted = compare(docs);
  assert.equal(shifted.status, 0, shifted.stdout);
  assert.match(shifted.stdout, /^PASS converter: no new warnings$/m);

  write(docs, 'a.md', `# Page a.md\n\n${SPLIT_LIST}\n\nText.\n\n${SPLIT_LIST}\n`);
  const added = compare(docs);
  assert.equal(added.status, 1);
  assert.match(added.stdout, /^FAIL converter: new warning a\.md: ordered list split by nested code block$/m);
});

test('converter: a missing baseline fails and tells the user to run --init', () => {
  const docs = mkDocs({ 'a.md': 'Text.' });
  const r = compare(docs);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL converter: no baseline file — run --init before editing$/m);
});

test('versions: an unknown version literal is a WARN only, a known one is silent', () => {
  const docs = mkDocs({ 'a.md': 'Use MariaDB 11.4.2 or PHP 8.3.1 (127.0.0.1 is an address).' });
  init(docs);
  const r = compare(docs, { foundation: mkFoundation('APP_NAME=x\nPHP_VERSION=8.3.1\n') });
  assert.equal(r.status, 0, r.stdout);
  assert.match(
    r.stdout,
    /^WARN versions: a\.md:3 11\.4\.2 not found in foundation config\/dockerfiles\/compose\/\.github$/m,
  );
  assert.doesNotMatch(r.stdout, /8\.3\.1/);
  assert.doesNotMatch(r.stdout, /127\.0\.0/);
});

test('--claims: rows are filtered to the line range', () => {
  const docs = mkDocs({
    'a.md': 'Run `make install`.\n\nRun `make install` again.\n\nRun `make install` once more.',
  });
  const r = runGate(docs, ['--claims=a.md:5-5']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^wrote \.claude\/doc-audit\/a\.claims\.tsv \(1 claims, 0 not verified, lines 5-5\)$/m);
  const tsv = fs.readFileSync(path.join(docs, '.claude/doc-audit/a.claims.tsv'), 'utf8').trimEnd().split('\n');
  assert.deepEqual(tsv, ['location\tkind\tvalue\tstatus', 'a.md:5\tmake\tinstall\tok']);
});

test('a claims failure does not stop the remaining checks', () => {
  const docs = mkDocs({ 'a.md': 'Run `make nosuchtarget`.\n\nPay with Stripe.' });
  init(docs);
  const r = compare(docs);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL claims: a\.md:3 make target `nosuchtarget` is not defined/m);
  assert.match(r.stdout, /^PASS title-drift$/m);
  assert.match(r.stdout, /^PASS links: /m);
  assert.match(r.stdout, /^FAIL excluded-terms: a\.md:5 stripe$/m);
  assert.match(r.stdout, /^PASS live-hosts$/m);
});

test('--claims writes the TSV although the checker exited 1 and WARN lines preceded the header', () => {
  const docs = mkDocs({ 'a.md': 'Run `make nosuchtarget`, then `make install`.' });
  const allow = mkAllowlist('[allowed]\nz.md var UNUSED_NAME  # never matches\n\n[known-drift]\n');
  const direct = spawnSync(
    process.execPath,
    [path.join(path.dirname(gate), 'check-doc-claims.mjs'), `--docs-root=${docs}`, `--allowlist=${allow}`, '--list-claims=a.md'],
    { env: { ...process.env, FOUNDATION_PATH: mkFoundation(), DOC_CLAIMS_REQUIRE_FOUNDATION: '1' }, encoding: 'utf8' },
  );
  assert.equal(direct.status, 1);
  assert.match(direct.stdout, /^check-doc-claims: WARN doc-claims-allowlist\.txt:\d+ entry never matched/m);
  assert.ok(direct.stdout.indexOf('WARN') < direct.stdout.indexOf('location\tkind'));

  const r = runGate(docs, ['--claims=a.md'], { allowlist: allow });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^wrote \.claude\/doc-audit\/a\.claims\.tsv \(2 claims, 1 not verified, whole file\)$/m);
  const tsv = fs.readFileSync(path.join(docs, '.claude/doc-audit/a.claims.tsv'), 'utf8').trimEnd().split('\n');
  assert.deepEqual(tsv, [
    'location\tkind\tvalue\tstatus',
    'a.md:3\tmake\tnosuchtarget\tfail',
    'a.md:3\tmake\tinstall\tok',
  ]);
});

test('claims: KNOWN DRIFT is counted in the PASS line and listed as WARN known-drift', () => {
  const docs = mkDocs({ 'a.md': 'Run `make nosuchtarget`.' });
  init(docs);
  const allow = mkAllowlist(
    '[allowed]\nz.md var UNUSED_NAME  # never matches\n\n[known-drift]\na.md make nosuchtarget  # really missing\n',
  );
  const r = compare(docs, { allowlist: allow });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^PASS claims: \d+ verified \(strict\), 1 known drift$/m);
  assert.match(r.stdout, /^WARN known-drift: a\.md:3 make target `nosuchtarget` is not defined .*\(allowlist line \d+\)$/m);
  assert.match(r.stdout, /^WARN claims: doc-claims-allowlist\.txt:\d+ entry never matched — remove it$/m);
});

test('foundation line says "(not a git repo)" for a foundation outside git', () => {
  const docs = mkDocs({ 'a.md': 'Text.' });
  const foundation = mkFoundation();
  const r = init(docs, { foundation });
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout.split('\n')[0], `foundation: ${foundation} (not a git repo)`);
});

test('setup: missing node_modules prints FAIL setup and exits 1 before any check', () => {
  const docs = mkDocs({ 'a.md': 'Text.' });
  const missing = path.join(tmp('nm'), 'node_modules');
  const r = runGate(docs, ['--compare-baseline'], { env: { MAKE_DOC_GATE_NODE_MODULES: missing } });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trimEnd(), 'FAIL setup: scripts/node_modules missing — run (cd scripts && npm ci)');
});
