import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractClaims } from '../lib/claims.mjs';
import {
  checkMakefileCoverage,
  loadFoundation,
  resolveFoundationPath,
  verifyClaims,
} from '../lib/foundation.mjs';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-doc-claims.mjs');

// Every fixture lives in a temp dir (synthetic trees only: these tests never read the live
// foundation checkout) and is removed in after().
const tmpDirs = [];
function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `doc-claims-${prefix}-`));
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

const MAKEFILE = [
  '.SILENT:',
  'X := y',
  '',
  'install:',
  '\techo install',
  'tf:',
  '\techo tf',
  'oidc:',
  '\techo oidc',
  'exec:',
  '\tbash ./sh/dev/run.sh exec $(PARAMS)',
  'run:',
  '\tbash ./sh/dev/run.sh run $(PARAMS)',
  '%:',
  '\t@:',
  '',
].join('\n');

const RUN_SH = ['MODE="$1"', 'SERVICE="$2"', 'USER="$3"', ''].join('\n');

/** A mini foundation checkout. Returns its root. */
function mkFoundation({ runSh = RUN_SH, kitModules = true, sslLive = true, stageEnv = true } = {}) {
  const root = tmp('foundation');
  write(root, 'Makefile', MAKEFILE);
  write(root, 'sh/dev/run.sh', runSh);
  write(root, 'config/environment/.env.main', 'APP_NAME=x\nAPP_DOMAIN=y\n');
  write(root, 'config/environment/.env.type.local', 'A=1\n');
  write(root, 'config/environment/.env.secret', 'SECRET_ONLY_VAR=1\n');
  write(root, 'config/environment/.env.type.local.override', 'OVERRIDE_ONLY_VAR=1\n');
  write(root, 'sh/local-ci/EVIDENCE.md', 'mentions TF_VAR_tf_lock_table\n');
  write(root, '.github/workflows/job-deploy.yml', 'name: deploy\n');
  if (sslLive) fs.mkdirSync(path.join(root, 'config/ssl/live'), { recursive: true });
  if (kitModules) {
    write(root, 'kit-modules/basis/sh/aws/oidc.sh', '#!/bin/sh\n');
    for (const env of ['dev', 'prod', 'shared', ...(stageEnv ? ['stage'] : [])]) {
      fs.mkdirSync(path.join(root, 'kit-modules/basis/terraform/envs', env), { recursive: true });
    }
  }
  return root;
}

function mkDocs(files) {
  const root = tmp('docs');
  for (const [name, content] of Object.entries(files)) write(root, name, content);
  return root;
}

function mkAllowlist(text) {
  const root = tmp('allowlist');
  write(root, 'allow.txt', text);
  return path.join(root, 'allow.txt');
}

const EMPTY_ALLOWLIST = '[allowed]\n\n[known-drift]\n';

/** Library-level run: extract + verify (+ Makefile coverage when the reference page is present). */
function verify(files, foundationRoot, { strict = false } = {}) {
  const claims = Object.entries(files).flatMap(([file, source]) => extractClaims({ file, source }));
  const foundation = loadFoundation(foundationRoot);
  const results = verifyClaims(claims, foundation, { strict });
  if (files['makefile-reference.md'] !== undefined) {
    const idx = files['makefile-reference.md'].split('\n').findIndex((l) => /^##\s+Targets\b/.test(l));
    results.push(
      ...checkMakefileCoverage(claims, foundation, { referenceLine: idx >= 0 ? idx + 1 : 1 }),
    );
  }
  return results;
}

const where = (r) => `${r.claim.file}:${r.claim.line} ${r.claim.kind}`;
const failures = (results) => results.filter((r) => r.status === 'fail').map(where);

function runCli(docsRoot, allowlistPath, { foundation, strict = false, args = [], env = {} } = {}) {
  const childEnv = { ...process.env, ...env };
  delete childEnv.DOC_CLAIMS_REQUIRE_FOUNDATION;
  delete childEnv.FOUNDATION_PATH;
  if (foundation !== undefined) childEnv.FOUNDATION_PATH = foundation;
  if (strict) childEnv.DOC_CLAIMS_REQUIRE_FOUNDATION = '1';
  const r = spawnSync(
    process.execPath,
    [cli, `--docs-root=${docsRoot}`, `--allowlist=${allowlistPath}`, ...args],
    { env: childEnv, encoding: 'utf8' },
  );
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// The past callout from commit a5b9f2e (`git show a5b9f2e^:infrastructure.md`), verbatim.
const PAST_CALLOUT = [
  '> The GitHub provisioning workflow offers `stage` as an environment choice alongside `dev` and',
  '> `prod`, but only `kit-modules/basis/terraform/envs/dev/`, `.../prod/`, and `.../shared/` ship',
  '> with the project — there is no `.../stage/` directory yet. Running `make tf stage ...` (or',
  '> triggering the workflow with `stage`) will fail until that env directory is created first,',
  '> following the pattern of `dev/`/`prod/`.',
].join('\n');

const MAKEFILE_REFERENCE_DRIFTED = [
  '# Makefile reference',
  '',
  '## Targets',
  '',
  '| Target | Purpose |',
  '| --- | --- |',
  '| `make install` | install |',
  '| `make tf <env> plan` | terraform |',
  '| `make exec <service> [user]` | shell |',
  '| `make run <service>` | run |',
  '',
  'Use `make oidc` to generate keys.',
  '',
  '[^1]: See also `make oidc test`.',
  '',
].join('\n');

const DRIFTED_DOCS = {
  'ci-cd-deployments.md': '# CI/CD\n\nRun `kit-modules/basis/sh/oidc.sh` now.\n',
  'env.md': '# Env\n\nThe lock table is `TF_VAR_tf_lock_table`.\n',
  'makefile-reference.md': MAKEFILE_REFERENCE_DRIFTED,
  'infrastructure.md': `# Infrastructure\n\n${PAST_CALLOUT}\n`,
  'relpath.md': '# Relpath\n\nThe Terraform directory `envs/stage` does not exist.\n',
  'database-management.md':
    '# DB\n\n```bash\nmake exec mariadb mariadb -u root -p -e "SELECT 1"\n```\n',
};

// ------------------------------------------------------------- real past drift, exact locations

test('past drift: every case fails at its exact file:line with the right kind', () => {
  const results = verify(DRIFTED_DOCS, mkFoundation());
  assert.deepEqual(failures(results).sort(), [
    'ci-cd-deployments.md:3 path',
    'database-management.md:4 make-args',
    'env.md:3 var',
    'infrastructure.md:5 path',
    'makefile-reference.md:3 make-ref',
    'relpath.md:3 relpath',
  ]);
});

test('past drift (1): kit-modules/basis/sh/oidc.sh fails although basis is installed', () => {
  const results = verify({ 'a.md': DRIFTED_DOCS['ci-cd-deployments.md'] }, mkFoundation());
  const r = results.find((x) => x.claim.value === 'kit-modules/basis/sh/oidc.sh');
  assert.equal(r.status, 'fail');
  assert.match(r.message, /does not exist in the foundation checkout/);
});

test('past drift (2): TF_VAR_tf_lock_table fails, the .md that mentions it is not searched', () => {
  const results = verify({ 'a.md': DRIFTED_DOCS['env.md'] }, mkFoundation());
  const r = results.find((x) => x.claim.kind === 'var');
  assert.equal(r.status, 'fail');
  assert.match(r.message, /`TF_VAR_tf_lock_table`/);
});

test('past drift (3): make oidc only in a footnote and prose -> make-ref fail naming Makefile:<line>', () => {
  const results = verify({ 'makefile-reference.md': MAKEFILE_REFERENCE_DRIFTED }, mkFoundation());
  const refs = results.filter((r) => r.claim.kind === 'make-ref');
  assert.equal(refs.length, 1);
  const oidcLine = MAKEFILE.split('\n').indexOf('oidc:') + 1;
  assert.equal(refs[0].claim.value, 'oidc');
  assert.equal(refs[0].claim.raw, `Makefile:${oidcLine}`);
  assert.match(refs[0].message, new RegExp(`\\(Makefile:${oidcLine}\\) has no table row in makefile-reference.md`));
  // the oidc mentions outside the table are still ordinary, passing make claims
  assert.deepEqual(failures(results), ['makefile-reference.md:3 make-ref']);
});

test('past drift (4): the verbatim past callout fails only at .../stage/ on its third line', () => {
  const results = verify({ 'infrastructure.md': `# Infrastructure\n\n${PAST_CALLOUT}\n` }, mkFoundation());
  assert.deepEqual(failures(results), ['infrastructure.md:5 path']);
  const fail = results.find((r) => r.status === 'fail');
  assert.equal(fail.claim.value, 'kit-modules/basis/terraform/envs/stage');
  assert.match(
    fail.message,
    /says `\.\.\.\/stage\/` \(= kit-modules\/basis\/terraform\/envs\/stage\) does not exist, but it exists in the foundation checkout/,
  );
  const ok = results.filter((r) => r.claim.kind === 'path').map((r) => [r.claim.value, r.status]);
  assert.deepEqual(ok, [
    ['kit-modules/basis/terraform/envs/dev', 'ok'],
    ['kit-modules/basis/terraform/envs/prod', 'ok'],
    ['kit-modules/basis/terraform/envs/shared', 'ok'],
    ['kit-modules/basis/terraform/envs/stage', 'fail'],
  ]);
});

test('past drift (5): "`envs/stage` does not exist" fails and names the real location', () => {
  const results = verify({ 'relpath.md': DRIFTED_DOCS['relpath.md'] }, mkFoundation());
  const r = results.find((x) => x.claim.kind === 'relpath');
  assert.equal(r.status, 'fail');
  assert.match(r.message, /`kit-modules\/basis\/terraform\/envs\/stage`/);
});

test('past drift (6): make exec with extra words fails; the make exec claim itself is ok', () => {
  const results = verify({ 'database-management.md': DRIFTED_DOCS['database-management.md'] }, mkFoundation());
  assert.deepEqual(
    results.map((r) => [r.claim.kind, r.status]),
    [
      ['make', 'ok'],
      ['make-args', 'fail'],
    ],
  );
  assert.match(
    results[1].message,
    /make exec takes at most 2 words \(service, user\): sh\/dev\/run\.sh reads only \$1\.\.\$3 \(mode, service, user\), so `-u root -p -e "SELECT 1"` is silently dropped/,
  );
});

test('corrected docs pass, incl. the same callout and sentence when envs/stage does not exist', () => {
  const corrected = {
    'ci-cd-deployments.md': '# CI/CD\n\nRun `kit-modules/basis/sh/aws/oidc.sh` now.\n',
    'env.md': '# Env\n\nSet `APP_NAME`.\n',
    'makefile-reference.md': MAKEFILE_REFERENCE_DRIFTED.replace(
      '| `make run <service>` | run |',
      '| `make run <service>` | run |\n| `make oidc <env>` | oidc |',
    ),
    'infrastructure.md': DRIFTED_DOCS['infrastructure.md'],
    'relpath.md': DRIFTED_DOCS['relpath.md'],
    'database-management.md': '# DB\n\n```bash\nmake exec mariadb mariadb\n```\n',
  };
  const results = verify(corrected, mkFoundation({ stageEnv: false }));
  assert.deepEqual(failures(results), []);
  assert.equal(results.filter((r) => r.claim.kind === 'make-ref').length, 0);
});

// ------------------------------------------------------------------------- foundation loading

test('loadFoundation: Makefile targets exclude .SILENT, assignments, % and recipe lines', () => {
  const f = loadFoundation(mkFoundation());
  assert.deepEqual([...f.targets.keys()], ['install', 'tf', 'oidc', 'exec', 'run']);
  assert.equal(f.targets.get('oidc'), MAKEFILE.split('\n').indexOf('oidc:') + 1);
  assert.deepEqual([...f.installedKitModules], ['basis']);
  assert.equal(f.makeArgLimitsStale, false);
  assert.ok(f.workflowNames.has('job-deploy.yml'));
});

test('loadFoundation: null for a missing dir or a dir without Makefile', () => {
  assert.equal(loadFoundation(path.join(os.tmpdir(), 'doc-claims-does-not-exist')), null);
  assert.equal(loadFoundation(tmp('empty')), null);
});

test('var corpus excludes .env.secret and *override* files', () => {
  const docs = { 'a.md': '# A\n\n`SECRET_ONLY_VAR` and `OVERRIDE_ONLY_VAR` and `APP_DOMAIN`.\n' };
  const results = verify(docs, mkFoundation());
  assert.deepEqual(
    results.map((r) => [r.claim.value, r.status]),
    [
      ['SECRET_ONLY_VAR', 'fail'],
      ['OVERRIDE_ONLY_VAR', 'fail'],
      ['APP_DOMAIN', 'ok'],
    ],
  );
});

test('workflow claims match basenames, including a placeholder pattern', () => {
  const docs = { 'a.md': '# A\n\n`job-deploy.yml`, `job-*.yml`, `job-missing.yml`.\n' };
  const results = verify(docs, mkFoundation());
  assert.deepEqual(
    results.map((r) => [r.claim.value, r.status]),
    [
      ['job-deploy.yml', 'ok'],
      ['job-*.yml', 'ok'],
      ['job-missing.yml', 'fail'],
    ],
  );
});

test('negated claim about something really absent passes; about something present fails', () => {
  const docs = { 'a.md': '# A\n\nThe file `sh/nope.sh` does not exist. The file `sh/dev/run.sh` does not exist.\n' };
  const results = verify(docs, mkFoundation());
  assert.deepEqual(
    results.map((r) => [r.claim.value, r.status]),
    [
      ['sh/nope.sh', 'ok'],
      ['sh/dev/run.sh', 'fail'],
    ],
  );
  assert.match(results[1].message, /says `sh\/dev\/run\.sh` does not exist, but it exists/);
});

test('an unresolved shortened path fails', () => {
  const results = verify({ 'a.md': '# A\n\nSee `.../stage/`.\n' }, mkFoundation());
  assert.equal(results[0].status, 'fail');
  assert.match(results[0].message, /has no full path before it/);
});

test('make: an undefined target fails', () => {
  const results = verify({ 'a.md': '# A\n\nRun `make nope`.\n' }, mkFoundation());
  assert.equal(results[0].status, 'fail');
  assert.match(results[0].message, /make target `nope` is not defined in .*\/Makefile/);
});

// --------------------------------------------------------------------- runtime-created paths

test('config/ssl/live/foo/privkey.pem fails when config/ssl/live exists, is "runtime" when it does not', () => {
  const docs = { 'a.md': '# A\n\nThe key is `config/ssl/live/foo/privkey.pem`.\n' };
  assert.equal(verify(docs, mkFoundation())[0].status, 'fail');
  assert.equal(verify(docs, mkFoundation({ sslLive: false }))[0].status, 'runtime');
});

// ------------------------------------------------------------------------------- kit-modules

test('kit-modules removed: basis claims are skipped (lenient) and fail (strict)', () => {
  const docs = { 'a.md': '# A\n\nSee `kit-modules/basis/sh/aws/oidc.sh`.\n' };
  const root = mkFoundation({ kitModules: false });
  assert.equal(verify(docs, root)[0].status, 'skipped');
  const strict = verify(docs, root, { strict: true })[0];
  assert.equal(strict.status, 'fail');
  assert.match(strict.message, /kit-module `basis` is not installed in the foundation checkout \(DOC_CLAIMS_REQUIRE_FOUNDATION=1\)/);
});

test('a known but not installed kit-module (proxy) is skipped; a typo (basiss) always fails', () => {
  const docs = { 'a.md': '# A\n\nSee `kit-modules/proxy/sh/x.sh` and `kit-modules/basiss/sh/x.sh`.\n' };
  const results = verify(docs, mkFoundation());
  assert.deepEqual(
    results.map((r) => [r.claim.value, r.status]),
    [
      ['kit-modules/proxy/sh/x.sh', 'skipped'],
      ['kit-modules/basiss/sh/x.sh', 'fail'],
    ],
  );
  assert.match(results[1].message, /unknown kit-module `basiss`/);
  assert.equal(verify(docs, mkFoundation({ kitModules: false }))[1].status, 'fail');
});

// --------------------------------------------------------------------------- placeholders

test('placeholder paths: with matches, with a pure-placeholder last segment, with zero matches', () => {
  const docs = {
    'a.md': [
      '# A',
      '',
      '`config/environment/.env.type.<env>`',
      '`config/ssl/live/<your-domain>/`',
      '`sh/dev/*.zzz`',
      '`kit-modules/{$name}/`',
      '`.github/workflows/**`',
      '`config/environment/.env.nomatch.[x]/file`',
      '',
    ].join('\n'),
  };
  const results = verify(docs, mkFoundation());
  assert.deepEqual(
    results.map((r) => [r.claim.value, r.status]),
    [
      ['config/environment/.env.type.<env>', 'ok'],
      ['config/ssl/live/<your-domain>', 'ok'],
      ['sh/dev/*.zzz', 'fail'],
      ['kit-modules/{$name}', 'ok'],
      ['.github/workflows/**', 'ok'],
      ['config/environment/.env.nomatch.[x]/file', 'fail'],
    ],
  );
});

// ------------------------------------------------------------------------- stale make limits

test('a run.sh that reads "$4" makes make-args skipped, and the CLI prints a WARN', () => {
  const foundation = mkFoundation({ runSh: `${RUN_SH}EXTRA="$4"\n` });
  const docs = { 'database-management.md': DRIFTED_DOCS['database-management.md'] };
  const results = verify(docs, foundation);
  assert.deepEqual(results.map((r) => r.status), ['ok', 'skipped']);

  const cliRun = runCli(mkDocs(docs), mkAllowlist(EMPTY_ALLOWLIST), { foundation });
  assert.equal(cliRun.status, 0);
  assert.match(cliRun.stdout, /check-doc-claims: WARN MAKE_ARG_LIMITS may be stale: sh\/dev\/run\.sh reads more than \$1\.\.\$3 — make-args check skipped/);
});

// ------------------------------------------------------------------------ resolveFoundationPath

test('resolveFoundationPath: FOUNDATION_PATH wins alone, a relative value resolves against repoRoot', () => {
  const base = tmp('resolve');
  const repoRoot = path.join(base, 'docs');
  fs.mkdirSync(repoRoot);
  write(base, 'starter-kit-foundation.loc/Makefile', '');
  write(base, 'custom/Makefile', '');

  assert.deepEqual(
    resolveFoundationPath({ env: { FOUNDATION_PATH: path.join(base, 'custom') }, repoRoot }),
    { path: path.join(base, 'custom'), source: 'env' },
  );
  assert.deepEqual(resolveFoundationPath({ env: { FOUNDATION_PATH: '../custom' }, repoRoot }), {
    path: path.join(base, 'custom'),
    source: 'env',
  });
  // no fallback to the sibling when FOUNDATION_PATH is set but wrong
  assert.deepEqual(resolveFoundationPath({ env: { FOUNDATION_PATH: '../nope' }, repoRoot }), {
    path: null,
    tried: [path.join(base, 'nope')],
  });
});

test('resolveFoundationPath: sibling, main-checkout sibling, and neither', () => {
  const base = tmp('resolve2');
  const repoRoot = path.join(base, 'docs');
  fs.mkdirSync(repoRoot);

  const neither = resolveFoundationPath({ env: {}, repoRoot, gitCommonDir: null });
  assert.deepEqual(neither, { path: null, tried: [path.join(base, 'starter-kit-foundation.loc')] });

  // a worktree under <main>/.claude/worktrees/x: its git-common-dir is <main>/.git
  const main = path.join(base, 'workspace', 'main-docs');
  const worktree = path.join(main, '.claude', 'worktrees', 'x');
  fs.mkdirSync(worktree, { recursive: true });
  const common = path.join(main, '.git');
  write(base, 'workspace/starter-kit-foundation.loc/Makefile', '');
  assert.deepEqual(resolveFoundationPath({ env: {}, repoRoot: worktree, gitCommonDir: common }), {
    path: path.join(base, 'workspace', 'starter-kit-foundation.loc'),
    source: 'main-checkout-sibling',
  });
  // a gitCommonDir that is not a ".git" directory is ignored
  assert.equal(
    resolveFoundationPath({ env: {}, repoRoot: worktree, gitCommonDir: path.join(main, 'other') }).path,
    null,
  );

  write(base, 'starter-kit-foundation.loc/Makefile', '');
  assert.deepEqual(resolveFoundationPath({ env: {}, repoRoot, gitCommonDir: null }), {
    path: path.join(base, 'starter-kit-foundation.loc'),
    source: 'sibling',
  });
});

// ------------------------------------------------------------------------------------ the CLI

test('CLI: drifted docs -> exit 1 with the six failures and the Fix line on stderr', () => {
  const r = runCli(mkDocs(DRIFTED_DOCS), mkAllowlist(EMPTY_ALLOWLIST), {
    foundation: mkFoundation(),
    strict: true,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /check-doc-claims: 6 unverified claim\(s\) found \(foundation: .+\):/);
  assert.match(r.stderr, /^ {2}ci-cd-deployments\.md:3 path `kit-modules\/basis\/sh\/oidc\.sh` does not exist in the foundation checkout$/m);
  assert.match(r.stderr, /^ {2}infrastructure\.md:5 path says `\.\.\.\/stage\/` \(= kit-modules\/basis\/terraform\/envs\/stage\) does not exist, but it exists in the foundation checkout$/m);
  assert.match(r.stderr, /^ {2}makefile-reference\.md:3 Makefile target `oidc` \(Makefile:\d+\) has no table row in makefile-reference\.md$/m);
  assert.match(r.stderr, /Fix: correct the doc\./);
});

test('CLI: clean docs -> exit 0 and the one-line success summary with the lookup source', () => {
  const docs = mkDocs({ 'a.md': '# A\n\nRun `make install`.\n', 'CLAUDE.md': '`make nope`\n', 'README.MD': '`make nope`\n' });
  const r = runCli(docs, mkAllowlist(EMPTY_ALLOWLIST), { foundation: mkFoundation(), strict: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^check-doc-claims: all 1 claims in 1 files verified against .+ \[env\] \(0 allowlisted, 0 KNOWN DRIFT, 0 skipped, 0 runtime-created\)\.$/m);
});

test('CLI: FOUNDATION_PATH to a nonexistent dir -> WARNING and exit 0; strict -> exit 1', () => {
  const docs = mkDocs({ 'a.md': '# A\n\nRun `make nope`.\n' });
  const allow = mkAllowlist(EMPTY_ALLOWLIST);
  const missing = path.join(os.tmpdir(), 'doc-claims-nonexistent-foundation');

  const lenient = runCli(docs, allow, { foundation: missing });
  assert.equal(lenient.status, 0);
  assert.match(lenient.stderr, /check-doc-claims: WARNING foundation checkout not found \(tried: .*doc-claims-nonexistent-foundation; set FOUNDATION_PATH\) — claims NOT verified\./);

  const strict = runCli(docs, allow, { foundation: missing, strict: true });
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /check-doc-claims: foundation checkout not found \(tried: .*\) and DOC_CLAIMS_REQUIRE_FOUNDATION=1 — set FOUNDATION_PATH\./);
});

test('CLI: DOC_CLAIMS_REQUIRE_FOUNDATION other than 1 stays lenient', () => {
  const docs = mkDocs({ 'a.md': '# A\n\nRun `make nope`.\n' });
  const r = runCli(docs, mkAllowlist(EMPTY_ALLOWLIST), {
    foundation: path.join(os.tmpdir(), 'doc-claims-nonexistent-foundation'),
    env: { DOC_CLAIMS_REQUIRE_FOUNDATION: '0' },
  });
  assert.equal(r.status, 0);
});

test('CLI --list-claims=<page>: header plus every claim of that page incl. ok ones', () => {
  const docs = mkDocs({
    'makefile-reference.md': MAKEFILE_REFERENCE_DRIFTED,
    'other.md': '# Other\n\nRun `make install`.\n',
  });
  const r = runCli(docs, mkAllowlist(EMPTY_ALLOWLIST), {
    foundation: mkFoundation(),
    strict: true,
    args: ['--list-claims=makefile-reference.md'],
  });
  assert.equal(r.status, 1);
  const lines = r.stdout.split('\n').filter((l) => l.includes('\t'));
  assert.equal(lines[0], 'location\tkind\tvalue\tstatus\traw');
  assert.ok(lines.includes('makefile-reference.md:7\tmake\tinstall\tok\t`make install`'));
  assert.ok(lines.includes('makefile-reference.md:12\tmake\toidc\tok\t`make oidc`'));
  assert.ok(lines.some((l) => l.startsWith('makefile-reference.md:3\tmake-ref\toidc\tfail\t')));
  assert.ok(lines.every((l) => !l.startsWith('other.md')));
});

test('CLI --list-claims (no value) lists every page; lenient without foundation -> unverified', () => {
  const docs = mkDocs({ 'a.md': '# A\n\nRun `make install`.\n', 'b.md': '# B\n\nRun `make tf`.\n' });
  const allow = mkAllowlist(EMPTY_ALLOWLIST);
  const all = runCli(docs, allow, { foundation: mkFoundation(), args: ['--list-claims'] });
  assert.equal(all.status, 0);
  assert.match(all.stdout, /^a\.md:3\tmake\tinstall\tok\t`make install`$/m);
  assert.match(all.stdout, /^b\.md:3\tmake\ttf\tok\t`make tf`$/m);

  const none = runCli(docs, allow, {
    foundation: path.join(os.tmpdir(), 'doc-claims-nonexistent-foundation'),
    args: ['--list-claims=a.md'],
  });
  assert.equal(none.status, 0);
  assert.match(none.stdout, /^a\.md:3\tmake\tinstall\tunverified\t`make install`$/m);
  assert.doesNotMatch(none.stdout, /b\.md/);
});

test('CLI --list-claims=nope.md -> exit 1', () => {
  const r = runCli(mkDocs({ 'a.md': '# A\n' }), mkAllowlist(EMPTY_ALLOWLIST), {
    foundation: mkFoundation(),
    args: ['--list-claims=nope.md'],
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /check-doc-claims: --list-claims: nope\.md is not a scanned doc page/);
});

test('CLI: an unknown argument exits 1', () => {
  const r = runCli(mkDocs({ 'a.md': '# A\n' }), mkAllowlist(EMPTY_ALLOWLIST), { args: ['--bogus'] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown argument --bogus/);
});

// ------------------------------------------------------------------------------- allowlist

const VAR_PAGE = '# P\n\nSet `NOT_A_REAL_VAR`.\n';

test('[allowed] suppresses a fail only in its own file', () => {
  const docs = mkDocs({ 'a.md': VAR_PAGE, 'b.md': VAR_PAGE });
  const allow = mkAllowlist('[allowed]\na.md var NOT_A_REAL_VAR  # external name\n\n[known-drift]\n');
  const r = runCli(docs, allow, { foundation: mkFoundation(), strict: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /1 unverified claim\(s\) found/);
  assert.match(r.stderr, /b\.md:3 variable `NOT_A_REAL_VAR`/);
  assert.doesNotMatch(r.stderr, /a\.md:3/);
});

test('[allowed] entry makes the run pass and is counted as allowlisted', () => {
  const docs = mkDocs({ 'a.md': VAR_PAGE });
  const allow = mkAllowlist('[allowed]\na.md var NOT_A_REAL_VAR  # external name\n');
  const r = runCli(docs, allow, { foundation: mkFoundation(), strict: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\(1 allowlisted, 0 KNOWN DRIFT, 0 skipped, 0 runtime-created\)/);
  assert.equal(r.stderr, '');
});

test('[known-drift] entry: exit 0, KNOWN DRIFT block on stderr, counted in the success line', () => {
  const docs = mkDocs({ 'a.md': VAR_PAGE });
  const allow = mkAllowlist('[allowed]\n\n[known-drift]\na.md var NOT_A_REAL_VAR  # really missing\n');
  const r = runCli(docs, allow, { foundation: mkFoundation(), strict: true });
  assert.equal(r.status, 0);
  assert.match(
    r.stderr,
    /check-doc-claims: KNOWN DRIFT — 1 claim\(s\) are wrong in the docs and only allowlisted \(not blocking; must be fixed or listed in the final report\):\n {2}a\.md:3 variable `NOT_A_REAL_VAR` not found .* \(allowlist line 4\)/,
  );
  assert.doesNotMatch(r.stdout, /KNOWN DRIFT —/);
  assert.match(r.stdout, /\(0 allowlisted, 1 KNOWN DRIFT, 0 skipped, 0 runtime-created\)/);
});

test('an allowlist entry that never matches warns on stdout and does not change the exit code', () => {
  const docs = mkDocs({ 'a.md': '# A\n\nRun `make install`.\n' });
  const allow = mkAllowlist('[allowed]\na.md var UNUSED_ENTRY_VAR  # stale\n');
  const r = runCli(docs, allow, { foundation: mkFoundation(), strict: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /check-doc-claims: WARN doc-claims-allowlist\.txt:2 entry never matched — remove it/);
});

test('an allowlist entry for make-ref and for make-args (value with spaces) matches', () => {
  const allow = mkAllowlist(
    [
      '[known-drift]',
      'makefile-reference.md make-ref oidc  # undocumented target',
      'database-management.md make-args exec mariadb mariadb -u root -p -e "SELECT 1"  # extra words',
      'ci-cd-deployments.md path kit-modules/basis/sh/oidc.sh  # drift',
      'env.md var TF_VAR_tf_lock_table  # drift',
      'infrastructure.md path kit-modules/basis/terraform/envs/stage  # drift',
      'relpath.md relpath envs/stage  # drift',
      '',
    ].join('\n'),
  );
  const r = runCli(mkDocs(DRIFTED_DOCS), allow, { foundation: mkFoundation(), strict: true });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /KNOWN DRIFT — 6 claim\(s\)/);
  assert.doesNotMatch(r.stdout, /never matched/);
});

test('an invalid allowlist (no reason) exits 1 with doc-claims-allowlist.txt:<n>', () => {
  const r = runCli(mkDocs({ 'a.md': '# A\n' }), mkAllowlist('[allowed]\na.md var FOO_BAR\n'), {
    foundation: mkFoundation(),
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /doc-claims-allowlist\.txt:2: missing "# reason"/);
});
