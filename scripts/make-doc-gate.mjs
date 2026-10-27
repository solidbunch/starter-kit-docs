#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Zero-token gate for the `make-doc` skill: one command runs the strict claim check, title drift,
 * the converter-warning baseline, links and anchors, excluded terms, live hosts and a version
 * number warning. Output is one line per item (`PASS|FAIL|WARN <check>: ...`), exit 1 if any FAIL.
 *
 *   node make-doc-gate.mjs --init
 *   node make-doc-gate.mjs --compare-baseline [--scope-docs=a.md,b.md]
 *   node make-doc-gate.mjs --claims=<doc>[:<from>-<to>] [--claims=...]
 *   common: --docs-root=<dir> (default: repo root), --allowlist=<file> (passed to the checker)
 *   env: FOUNDATION_PATH (passed through), MAKE_DOC_GATE_NODE_MODULES (tests: node_modules dir)
 *
 * The static imports are `node:` builtins only: `lib/title-drift.mjs`, `lib/links.mjs` and
 * `lib/foundation.mjs` load `markdown-it`, so they are imported dynamically, after the
 * node_modules check. Details: `scripts/README.md`, "make-doc gate".
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const CHECKER = path.join(__dirname, 'check-doc-claims.mjs');
const CHECKER_PREFIX = 'check-doc-claims:';
const TSV_HEADER = 'location\tkind\tvalue\tstatus\traw';
const BASELINE_REL = path.join('.claude', 'doc-audit', 'converter-baseline.json');

const EXCLUDED_TERMS_RE = /is_demo|starter-kit-addon|\bstripe\b|docs-publisher|skt\/v1/gi;
const HOST_RE = /(https?:\/\/)?((?:[a-z0-9-]+\.)*)starter-kit\.io(\/[^\s)>\]`"']*)?/gi;
const VERSION_RE = /(?<![\d.])\d+\.\d+\.\d+(?![\d]|\.\d)/g;
const VERSION_DIRS = ['config/environment', 'dockerfiles', '.github'];
const MAX_VERSION_FILE_BYTES = 1024 * 1024;

let failed = false;
const out = (line) => console.log(line);
const fail = (check, text) => {
  failed = true;
  out(`FAIL ${check}: ${text}`);
};

function parseArgs(argv) {
  const opts = {
    docsRoot: repoRoot,
    allowlist: null,
    init: false,
    compare: false,
    claims: [],
    scopeDocs: null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--docs-root=')) opts.docsRoot = path.resolve(arg.slice('--docs-root='.length));
    else if (arg.startsWith('--allowlist=')) opts.allowlist = path.resolve(arg.slice('--allowlist='.length));
    else if (arg === '--init') opts.init = true;
    else if (arg === '--compare-baseline') opts.compare = true;
    else if (arg.startsWith('--claims=')) {
      const m = arg.slice('--claims='.length).match(/^([^:]+\.md)(?::(\d+)-(\d+))?$/);
      if (!m) throw new Error(`--claims expects <doc>.md[:<from>-<to>], got ${arg}`);
      opts.claims.push({ doc: m[1], from: m[2] ? Number(m[2]) : null, to: m[3] ? Number(m[3]) : null });
    } else if (arg.startsWith('--scope-docs=')) {
      opts.scopeDocs = arg.slice('--scope-docs='.length).split(',').filter(Boolean);
    } else throw new Error(`unknown argument ${arg}`);
  }
  const modes = [opts.init, opts.compare, opts.claims.length > 0].filter(Boolean).length;
  if (modes !== 1) throw new Error('give exactly one of --init, --compare-baseline, --claims=<doc>');
  return opts;
}

function git(root, args) {
  const r = spawnSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function gitCommonDir() {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Prints the foundation line; returns the foundation root or null. */
function foundationLine(foundationLib) {
  const resolved = foundationLib.resolveFoundationPath({
    env: process.env,
    repoRoot,
    gitCommonDir: process.env.FOUNDATION_PATH ? null : gitCommonDir(),
  });
  if (!resolved.path) {
    fail('foundation', `not found (tried: ${(resolved.tried ?? []).join(', ')})`);
    return null;
  }
  const sha = git(resolved.path, ['rev-parse', '--short', 'HEAD']);
  if (sha === null) {
    out(`foundation: ${resolved.path} (not a git repo)`);
  } else {
    const dirty = git(resolved.path, ['status', '--porcelain']);
    out(`foundation: ${resolved.path} @ ${sha} (${dirty === '' ? 'clean' : 'dirty'})`);
  }
  return resolved.path;
}

function runChecker(opts, extraArgs) {
  const args = [CHECKER, `--docs-root=${opts.docsRoot}`, ...extraArgs];
  if (opts.allowlist) args.push(`--allowlist=${opts.allowlist}`);
  const r = spawnSync(process.execPath, args, {
    env: { ...process.env, DOC_CLAIMS_REQUIRE_FOUNDATION: '1' },
    encoding: 'utf8',
  });
  return {
    status: r.status,
    error: r.error,
    stdout: (r.stdout ?? '').split('\n'),
    stderr: (r.stderr ?? '').split('\n'),
  };
}

/** Failure and KNOWN DRIFT entries from the checker's stderr (two-space-indented lines). */
function parseStderrBlocks(lines) {
  const failures = [];
  const drift = [];
  let mode = null;
  for (const line of lines) {
    if (line.startsWith(`${CHECKER_PREFIX} KNOWN DRIFT`)) mode = drift;
    else if (/^check-doc-claims: \d+ unverified claim\(s\) found/.test(line)) mode = failures;
    else if (mode && line.startsWith('  ')) mode.push(line.trim());
    else if (line.trim() !== '') mode = null;
  }
  return { failures, drift };
}

function firstLine(lines) {
  return lines.find((l) => l.trim() !== '') ?? 'no output';
}

function strictClaims(opts) {
  const r = runChecker(opts, []);
  if (r.error) {
    fail('claims', r.error.message);
    return;
  }
  const { failures, drift } = parseStderrBlocks(r.stderr);
  const warns = r.stdout
    .filter((l) => l.startsWith(`${CHECKER_PREFIX} WARN `))
    .map((l) => l.slice(`${CHECKER_PREFIX} WARN `.length));
  const success = r.stdout
    .map((l) => l.match(/^check-doc-claims: all (\d+) claims .*\((\d+) allowlisted, (\d+) KNOWN DRIFT,/))
    .find(Boolean);

  if (r.status === 0 && success) {
    out(`PASS claims: ${success[1]} verified (strict), ${success[3]} known drift`);
  } else if (failures.length > 0) {
    for (const f of failures) fail('claims', f);
  } else {
    fail('claims', firstLine(r.stderr.concat(r.status === 0 ? r.stdout : [])));
  }
  for (const w of warns) out(`WARN claims: ${w}`);
  for (const d of drift) out(`WARN known-drift: ${d}`);
}

/** `--claims`: one checker run per doc, rows filtered to the range, TSV written. */
function writeClaims(opts) {
  for (const { doc, from, to } of opts.claims) {
    const r = runChecker(opts, [`--list-claims=${doc}`]);
    const start = r.stdout.indexOf(TSV_HEADER);
    if (r.error || start === -1) {
      fail('claims', `${doc}: ${r.error ? r.error.message : firstLine(r.stderr)}`);
      continue;
    }
    const rows = [];
    for (const line of r.stdout.slice(start + 1)) {
      if (!line.includes('\t')) break;
      const cols = line.split('\t');
      const lineNo = Number(cols[0].slice(cols[0].lastIndexOf(':') + 1));
      if (from !== null && (lineNo < from || lineNo > to)) continue;
      rows.push(cols.slice(0, 4));
    }
    const dir = path.join(opts.docsRoot, '.claude', 'doc-audit');
    const target = path.join(dir, `${doc.slice(0, -3)}.claims.tsv`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      target,
      ['location\tkind\tvalue\tstatus', ...rows.map((c) => c.join('\t'))].join('\n') + '\n',
    );
    const notVerified = rows.filter((c) => c[3] === 'fail').length;
    const range = from === null ? 'whole file' : `lines ${from}-${to}`;
    out(
      `wrote ${path.relative(opts.docsRoot, target)} (${rows.length} claims, ${notVerified} not verified, ${range})`,
    );
  }
}

/** Baseline form: `{ file: [warning text without the leading file:line] }`. */
function toBaseline(warnings) {
  const byFile = {};
  for (const w of warnings) {
    const m = w.match(/^(.+?\.md):\d+ (.*)$/s);
    const [file, text] = m ? [m[1], m[2]] : ['(unknown)', w];
    (byFile[file] ??= []).push(text);
  }
  return byFile;
}

function newWarnings(baseline, current) {
  const fresh = [];
  for (const [file, texts] of Object.entries(current)) {
    const remaining = new Map();
    for (const t of baseline[file] ?? []) remaining.set(t, (remaining.get(t) ?? 0) + 1);
    for (const t of texts) {
      const left = remaining.get(t) ?? 0;
      if (left > 0) remaining.set(t, left - 1);
      else fresh.push(`${file}: ${t}`);
    }
  }
  return fresh;
}

function lineMatches(docsRoot, files, re) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(path.join(docsRoot, file), 'utf8').split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(re)) hits.push({ file, line: i + 1, match: m });
    });
  }
  return hits;
}

function excludedTerms(docsRoot, pages) {
  const seen = new Set();
  const hits = lineMatches(docsRoot, pages, EXCLUDED_TERMS_RE).filter((h) => {
    const key = `${h.file}:${h.line}:${h.match[0].toLowerCase()}`;
    return !seen.has(key) && seen.add(key);
  });
  if (hits.length === 0) out('PASS excluded-terms');
  for (const h of hits) fail('excluded-terms', `${h.file}:${h.line} ${h.match[0].toLowerCase()}`);
}

function liveHosts(docsRoot, pages) {
  const bad = lineMatches(docsRoot, pages, HOST_RE).filter(({ match }) => {
    const [, , sub, rest] = match;
    const host = `${sub}starter-kit.io`.toLowerCase();
    if (host === 'licensing.starter-kit.io') return false;
    return !(sub === '' && (!rest || rest === '/'));
  });
  if (bad.length === 0) out('PASS live-hosts');
  for (const h of bad) fail('live-hosts', `${h.file}:${h.line} ${h.match[0]}`);
}

function readVersionCorpus(foundationRoot) {
  const texts = [];
  const visit = (abs) => {
    let st;
    try {
      st = statSync(abs);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      if (path.basename(abs) === 'node_modules' || path.basename(abs) === '.git') return;
      for (const name of readdirSync(abs)) visit(path.join(abs, name));
    } else if (st.size <= MAX_VERSION_FILE_BYTES) {
      const base = path.basename(abs);
      if (base === '.env.secret' || base.includes('override')) return;
      texts.push(readFileSync(abs, 'utf8'));
    }
  };
  for (const dir of VERSION_DIRS) visit(path.join(foundationRoot, dir));
  for (const name of readdirSync(foundationRoot)) {
    if (/^docker-compose.*\.yml$/.test(name)) visit(path.join(foundationRoot, name));
  }
  return texts;
}

function versions(docsRoot, pages, scopeDocs, foundationRoot) {
  if (foundationRoot === null) return;
  const corpus = readVersionCorpus(foundationRoot);
  const scope = scopeDocs ?? pages;
  const seen = new Set();
  for (const h of lineMatches(docsRoot, scope, VERSION_RE)) {
    const v = h.match[0];
    const key = `${h.file}:${h.line}:${v}`;
    if (seen.has(key) || corpus.some((t) => t.includes(v))) continue;
    seen.add(key);
    out(`WARN versions: ${h.file}:${h.line} ${v} not found in foundation config/dockerfiles/compose/.github`);
  }
}

function initBaseline(opts, titleDrift) {
  let result;
  try {
    result = titleDrift.findTitleDrift(opts.docsRoot);
  } catch (err) {
    fail('converter', err.message);
    return;
  }
  const target = path.join(opts.docsRoot, BASELINE_REL);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(toBaseline(result.warnings), null, 2)}\n`);
  out(`wrote ${BASELINE_REL} (${result.warnings.length} converter warnings)`);
}

function compareBaseline(opts, libs, foundationRoot) {
  strictClaims(opts);

  let drift = null;
  try {
    drift = libs.titleDrift.findTitleDrift(opts.docsRoot);
  } catch (err) {
    fail('title-drift', err.message);
    fail('converter', `skipped: ${err.message}`);
  }
  if (drift) {
    if (drift.problems.length === 0) out('PASS title-drift');
    for (const p of drift.problems) fail('title-drift', p);

    const baselinePath = path.join(opts.docsRoot, BASELINE_REL);
    if (!existsSync(baselinePath)) {
      fail('converter', 'no baseline file — run --init before editing');
    } else {
      let baseline = null;
      try {
        baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      } catch (err) {
        fail('converter', `baseline unreadable (${err.message}) — run --init`);
      }
      if (baseline) {
        const fresh = newWarnings(baseline, toBaseline(drift.warnings));
        if (fresh.length === 0) out('PASS converter: no new warnings');
        for (const w of fresh) fail('converter', `new warning ${w}`);
      }
    }
  }

  let pages = null;
  try {
    pages = libs.links.listPages(opts.docsRoot);
  } catch (err) {
    for (const check of ['links', 'excluded-terms', 'live-hosts']) fail(check, err.message);
  }
  if (pages) {
    const links = libs.links.checkLinks(opts.docsRoot);
    if (links.problems.length === 0) out(`PASS links: ${links.linkCount} links, ${links.anchorCount} anchors`);
    for (const p of links.problems) fail('links', p);
    excludedTerms(opts.docsRoot, pages);
    liveHosts(opts.docsRoot, pages);
    versions(opts.docsRoot, pages, opts.scopeDocs, foundationRoot);
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`make-doc-gate: ${err.message}`);
    process.exit(1);
  }

  const nodeModules = process.env.MAKE_DOC_GATE_NODE_MODULES ?? path.join(__dirname, 'node_modules');
  if (!existsSync(path.join(nodeModules, 'markdown-it'))) {
    out('FAIL setup: scripts/node_modules missing — run (cd scripts && npm ci)');
    process.exit(1);
  }

  const libs = {
    titleDrift: await import('./lib/title-drift.mjs'),
    links: await import('./lib/links.mjs'),
    foundation: await import('./lib/foundation.mjs'),
  };

  const foundationRoot = foundationLine(libs.foundation);

  if (opts.init) initBaseline(opts, libs.titleDrift);
  else if (opts.compare) compareBaseline(opts, libs, foundationRoot);
  else writeClaims(opts);

  process.exit(failed ? 1 : 0);
}

main();
