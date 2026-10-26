#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractClaims, parseAllowlist } from './lib/claims.mjs';
import {
  checkMakefileCoverage,
  loadFoundation,
  resolveFoundationPath,
  verifyClaims,
} from './lib/foundation.mjs';

/**
 * Offline pre-commit check: does every checkable claim in the root doc pages (Makefile targets,
 * `make exec|run` argument counts, repo paths incl. shortened `.../x/` and negated relative
 * paths, env var names, workflow file names) match the `starter-kit-foundation` checkout, and
 * does every Makefile target have a table row in `makefile-reference.md`? Extraction lives in
 * `lib/claims.mjs`, verification in `lib/foundation.mjs`; this file is arguments, file discovery,
 * allowlist application, printing and the exit code.
 *
 * Options: `--docs-root=<dir>` (default: repo root), `--allowlist=<file>` (default:
 * `scripts/doc-claims-allowlist.txt`), `--list-claims[=<file.md>]` (also print every claim with
 * its status, tab-separated). Env: `FOUNDATION_PATH`; `DOC_CLAIMS_REQUIRE_FOUNDATION=1` turns a
 * missing foundation and a not-installed kit-module into failures (otherwise a missing foundation
 * is a stderr WARNING and exit 0, so a contributor without the checkout can still commit).
 * Why the foundation lookup also tries the main checkout's sibling: see `resolveFoundationPath()`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const REFERENCE_FILE = 'makefile-reference.md';
const PREFIX = 'check-doc-claims:';

function parseArgs(argv) {
  const opts = { docsRoot: repoRoot, allowlist: path.join(__dirname, 'doc-claims-allowlist.txt'), listClaims: null };
  for (const arg of argv) {
    if (arg.startsWith('--docs-root=')) opts.docsRoot = path.resolve(arg.slice('--docs-root='.length));
    else if (arg.startsWith('--allowlist=')) opts.allowlist = path.resolve(arg.slice('--allowlist='.length));
    else if (arg === '--list-claims') opts.listClaims = true;
    else if (arg.startsWith('--list-claims=')) opts.listClaims = arg.slice('--list-claims='.length);
    else throw new Error(`unknown argument ${arg}`);
  }
  return opts;
}

function gitCommonDir() {
  try {
    return execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Doc pages: entries of the docs root ending in `.md` (case-sensitive), except CLAUDE.md. */
function discoverFiles(docsRoot) {
  return readdirSync(docsRoot, { withFileTypes: true })
    .filter((e) => !e.isDirectory() && e.name.endsWith('.md') && e.name !== 'CLAUDE.md')
    .map((e) => e.name)
    .sort();
}

function printList(rows) {
  const clean = (s) => String(s).replace(/[\t\r\n]+/g, ' ');
  console.log('location\tkind\tvalue\tstatus\traw');
  for (const { claim, status } of rows) {
    console.log(
      [`${claim.file}:${claim.line}`, claim.kind, clean(claim.value), status, clean(claim.raw)].join('\t'),
    );
  }
}

function main() {
  const strict = process.env.DOC_CLAIMS_REQUIRE_FOUNDATION === '1';

  let opts;
  let allowlist;
  try {
    opts = parseArgs(process.argv.slice(2));
    allowlist = parseAllowlist(readFileSync(opts.allowlist, 'utf8'));
  } catch (err) {
    console.error(`${PREFIX} ${err.message}`);
    process.exit(1);
  }

  const files = discoverFiles(opts.docsRoot);
  if (typeof opts.listClaims === 'string' && !files.includes(opts.listClaims)) {
    console.error(`${PREFIX} --list-claims: ${opts.listClaims} is not a scanned doc page`);
    process.exit(1);
  }

  const sources = new Map(files.map((f) => [f, readFileSync(path.join(opts.docsRoot, f), 'utf8')]));
  const claims = files.flatMap((file) => extractClaims({ file, source: sources.get(file) }));

  const resolved = resolveFoundationPath({
    env: process.env,
    repoRoot,
    gitCommonDir: process.env.FOUNDATION_PATH ? null : gitCommonDir(),
  });
  const foundation = resolved.path ? loadFoundation(resolved.path) : null;

  if (!foundation) {
    const tried = (resolved.tried ?? [resolved.path]).join(', ');
    if (strict) {
      console.error(
        `${PREFIX} foundation checkout not found (tried: ${tried}) and DOC_CLAIMS_REQUIRE_FOUNDATION=1 — set FOUNDATION_PATH.`,
      );
      process.exit(1);
    }
    console.error(
      `${PREFIX} WARNING foundation checkout not found (tried: ${tried}; set FOUNDATION_PATH) — claims NOT verified.`,
    );
    if (opts.listClaims !== null) {
      printList(
        claims
          .filter((c) => opts.listClaims === true || c.file === opts.listClaims)
          .map((claim) => ({ claim, status: 'unverified' })),
      );
    }
    return;
  }

  const results = verifyClaims(claims, foundation, { strict });
  if (sources.has(REFERENCE_FILE)) {
    const m = sources.get(REFERENCE_FILE).split('\n').findIndex((l) => /^##\s+Targets\b/.test(l));
    results.push(
      ...checkMakefileCoverage(claims, foundation, {
        referenceFile: REFERENCE_FILE,
        referenceLine: m >= 0 ? m + 1 : 1,
      }),
    );
  }

  // Apply the allowlist: only `fail` results are matched, by file + kind + value.
  const used = new Set();
  for (const r of results) {
    if (r.status !== 'fail') continue;
    const entry = allowlist.find(
      (e) => e.file === r.claim.file && e.kind === r.claim.kind && e.value === r.claim.value,
    );
    if (!entry) continue;
    used.add(entry);
    r.status = entry.section === 'allowed' ? 'allowed' : 'known-drift';
    r.allowlistLine = entry.line;
  }

  const fileOrder = new Map(files.map((f, i) => [f, i]));
  const ordered = results
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        fileOrder.get(a.r.claim.file) - fileOrder.get(b.r.claim.file) ||
        a.r.claim.line - b.r.claim.line ||
        a.i - b.i,
    )
    .map((x) => x.r);

  const count = (s) => results.filter((r) => r.status === s).length;
  const failures = ordered.filter((r) => r.status === 'fail');
  const drift = ordered.filter((r) => r.status === 'known-drift');

  // Warnings (stdout, never change the exit code).
  const skippedModules = new Map();
  for (const r of results) {
    if (r.status === 'skipped' && r.claim.kind === 'path') {
      const mod = r.claim.value.split('/')[1];
      skippedModules.set(mod, (skippedModules.get(mod) ?? 0) + 1);
    }
  }
  for (const [mod, n] of skippedModules) {
    console.log(`${PREFIX} WARN kit-module \`${mod}\` is not installed in the foundation checkout — ${n} path claim(s) skipped`);
  }
  if (results.some((r) => r.status === 'skipped' && r.claim.kind === 'make-args')) {
    console.log(
      `${PREFIX} WARN MAKE_ARG_LIMITS may be stale: sh/dev/run.sh reads more than $1..$3 — make-args check skipped`,
    );
  }
  for (const e of allowlist) {
    if (!used.has(e)) {
      console.log(`${PREFIX} WARN doc-claims-allowlist.txt:${e.line} entry never matched — remove it`);
    }
  }

  if (opts.listClaims !== null) {
    printList(ordered.filter((r) => opts.listClaims === true || r.claim.file === opts.listClaims));
  }

  if (drift.length > 0) {
    console.error(
      `${PREFIX} KNOWN DRIFT — ${drift.length} claim(s) are wrong in the docs and only allowlisted (not blocking; must be fixed or listed in the final report):`,
    );
    for (const r of drift) {
      console.error(`  ${r.claim.file}:${r.claim.line} ${r.message} (allowlist line ${r.allowlistLine})`);
    }
  }

  if (failures.length > 0) {
    console.error(`${PREFIX} ${failures.length} unverified claim(s) found (foundation: ${foundation.root}):\n`);
    for (const r of failures) console.error(`  ${r.claim.file}:${r.claim.line} ${r.message}`);
    console.error(
      '\nFix: correct the doc. Only for a legitimate non-match, add a "<file> <kind> <value>  # reason" entry to scripts/doc-claims-allowlist.txt — never to hide real drift.',
    );
    process.exit(1);
  }

  console.log(
    `${PREFIX} all ${results.length} claims in ${files.length} files verified against ${foundation.root} [${resolved.source}] ` +
      `(${count('allowed')} allowlisted, ${drift.length} KNOWN DRIFT, ${count('skipped')} skipped, ${count('runtime')} runtime-created).`,
  );
}

main();
