import fs from 'node:fs';
import path from 'node:path';

import { MAKE_ARG_LIMITS } from './claims.mjs';

/**
 * Verifies doc claims (see `lib/claims.mjs`) against a checkout of `starter-kit-foundation`.
 * Filesystem reads only: nothing here ever writes, and file contents (which may include secrets)
 * are never put into a message. `check-doc-claims.mjs` prints the results; the allowlist is
 * applied there, not here.
 *
 * Result shape: `{claim, status, message}` with `status` one of `ok` | `fail` | `skipped` |
 * `runtime` (the CLI adds `allowed` | `known-drift`).
 */

export const FOUNDATION_DIR_NAME = 'starter-kit-foundation.loc';

/** Kit-modules a doc may name. An unknown name (a typo) always fails. */
export const KNOWN_KIT_MODULES = ['basis', 'monitoring-client', 'monitoring-server', 'proxy'];

/**
 * Paths the foundation creates at runtime. A claim equal to or under one of these gets status
 * `runtime` only when the root itself is absent; if it exists, the claim is checked normally and
 * a missing file under it fails. `kit-modules` is deliberately NOT here: the foundation's
 * `.gitignore:85 /kit-modules` means "not shipped in the template", it does not make files inside
 * an installed module runtime-created.
 */
export const RUNTIME_CREATED_PATHS = [
  // foundation .gitignore `/config/ssl/**`: certbot / mkcert output
  'config/ssl/live',
  // foundation .gitignore `.env.*secret`: written by `make secret`
  'config/environment/.env.secret',
  // foundation .gitignore `.env.*override`: user-created
  'config/environment/.env.type.local.override',
];

/** Directory names never entered by a walk, at any depth. */
const SKIP_DIR_NAMES = new Set(['node_modules', 'vendor', '.git', '.terraform', '.terragrunt-cache']);
/** Foundation-root-relative directories never entered by a walk. */
const SKIP_ROOT_RELS = new Set([
  'db-data',
  'logs',
  'tmp',
  'backups',
  'cache',
  'tfplans',
  'web/wp-core',
  'web/wp-content/uploads',
]);

const MAX_CORPUS_FILE_BYTES = 1024 * 1024;
const PLACEHOLDER_RE = /<[^>]+>|\[[^\]]+\]|\{[^}]+\}|\*\*|\*/;
const PLACEHOLDER_SPLIT_RE = /(<[^>]+>|\[[^\]]+\]|\{[^}]+\}|\*\*|\*)/;
const PURE_PLACEHOLDER_RE = /^(?:<[^>]+>|\[[^\]]+\]|\{[^}]+\})$/;
const TARGET_LINE_RE = /^([A-Za-z0-9][A-Za-z0-9_.-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_.-]*)*)\s*::?(?!=)/;
const ASSIGNMENT_LINE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\s*::?=/;
const STALE_RUN_SH_RE = /\$\{?[4-9@*]|\bshift\b/;

const VAR_SEARCHED = 'config/environment, sh/env, docker-compose*.yml, Makefile, dockerfiles, .github, .gitlab-ci.yml, .gitlab (*.md excluded)';

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

function isFoundationDir(p) {
  return isDir(p) && isFile(path.join(p, 'Makefile'));
}

/**
 * Locate the foundation checkout. `FOUNDATION_PATH` wins when set and is used alone (a relative
 * value resolves against `repoRoot`, no fallback). Otherwise the first candidate that is a
 * directory with a `Makefile` wins: the sibling `../starter-kit-foundation.loc` next to this
 * checkout, then the one next to the main checkout (via `gitCommonDir`, so git worktrees such as
 * `.claude/worktrees/*` find it too). The CLI does the git call and passes `gitCommonDir`
 * (absolute or relative to `repoRoot`; null if git failed).
 *
 * @param {{env: Record<string, string | undefined>, repoRoot: string, gitCommonDir?: string | null}} input
 * @returns {{path: string, source: 'env' | 'sibling' | 'main-checkout-sibling'} | {path: null, tried: string[]}}
 */
export function resolveFoundationPath({ env, repoRoot, gitCommonDir = null }) {
  if (env.FOUNDATION_PATH) {
    const p = path.resolve(repoRoot, env.FOUNDATION_PATH);
    return isFoundationDir(p) ? { path: p, source: 'env' } : { path: null, tried: [p] };
  }

  const candidates = [{ p: path.resolve(repoRoot, '..', FOUNDATION_DIR_NAME), source: 'sibling' }];
  if (gitCommonDir) {
    const common = path.resolve(repoRoot, gitCommonDir);
    if (path.basename(common) === '.git') {
      candidates.push({
        p: path.resolve(path.dirname(common), '..', FOUNDATION_DIR_NAME),
        source: 'main-checkout-sibling',
      });
    }
  }

  const tried = [];
  for (const { p, source } of candidates) {
    if (tried.includes(p)) continue;
    if (isFoundationDir(p)) return { path: p, source };
    tried.push(p);
  }
  return { path: null, tried };
}

/**
 * Walk the tree under `startRel` (relative to `root`), skipping the walk skip list. Unreadable
 * directories are skipped silently; symlinks are not followed (reported as files).
 *
 * @param {string} root
 * @param {string} startRel '' for the whole root
 * @returns {{rel: string, type: 'dir' | 'file'}[]} paths relative to `root`, `/`-separated
 */
function walk(root, startRel) {
  const out = [];
  const visit = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (SKIP_DIR_NAMES.has(e.name) || SKIP_ROOT_RELS.has(childRel)) continue;
        out.push({ rel: childRel, type: 'dir' });
        visit(childRel);
      } else {
        out.push({ rel: childRel, type: 'file' });
      }
    }
  };
  visit(startRel);
  return out;
}

function readCorpusFile(root, rel, corpus) {
  if (rel.endsWith('.md')) return;
  const abs = path.join(root, rel);
  try {
    if (fs.statSync(abs).size > MAX_CORPUS_FILE_BYTES) return;
    corpus.push({ rel, text: fs.readFileSync(abs, 'utf8') });
  } catch {
    // unreadable: skipped silently
  }
}

/**
 * Read the facts claims are verified against.
 *
 * Var corpus (`*.md` always excluded, files > 1 MB skipped): `config/environment/**` except
 * `.env.secret` and `*override*`, `sh/env/**`, root `docker-compose*.yml`, root `Makefile`,
 * `dockerfiles/**`, `.github/**`, root `.gitlab-ci.yml`, `.gitlab/**`. Markdown is excluded
 * because the foundation's `sh/local-ci/EVIDENCE.md` still mentions `TF_VAR_tf_lock_table`, which
 * would hide exactly the drift the checker must catch; gitignored machine-local files are
 * excluded so results are the same on every machine.
 *
 * @param {string} foundationPath
 * @returns {null | {root: string, targets: Map<string, number>, varCorpus: {rel: string, text: string}[], workflowNames: Set<string>, installedKitModules: Set<string> | null, makeArgLimitsStale: boolean}}
 */
export function loadFoundation(foundationPath) {
  if (!isFoundationDir(foundationPath)) return null;
  const root = path.resolve(foundationPath);

  const targets = new Map();
  fs.readFileSync(path.join(root, 'Makefile'), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (ASSIGNMENT_LINE_RE.test(line)) return;
      const m = line.match(TARGET_LINE_RE);
      if (!m) return;
      for (const name of m[1].split(/\s+/)) if (!targets.has(name)) targets.set(name, i + 1);
    });

  const varCorpus = [];
  for (const dir of ['config/environment', 'sh/env', 'dockerfiles', '.github', '.gitlab']) {
    for (const { rel, type } of walk(root, dir)) {
      if (type !== 'file') continue;
      if (dir === 'config/environment') {
        const base = path.posix.basename(rel);
        if (base === '.env.secret' || base.includes('override')) continue;
      }
      readCorpusFile(root, rel, varCorpus);
    }
  }
  const rootFiles = fs.readdirSync(root, { withFileTypes: true }).filter((e) => !e.isDirectory());
  for (const e of rootFiles) {
    if (e.name === 'Makefile' || e.name === '.gitlab-ci.yml' || /^docker-compose.*\.yml$/.test(e.name)) {
      readCorpusFile(root, e.name, varCorpus);
    }
  }

  const workflowNames = new Set(rootFiles.map((e) => e.name));
  for (const dir of ['.github', '.gitlab']) {
    for (const { rel, type } of walk(root, dir)) {
      if (type === 'file') workflowNames.add(path.posix.basename(rel));
    }
  }

  let installedKitModules = null;
  if (isDir(path.join(root, 'kit-modules'))) {
    installedKitModules = new Set(
      fs
        .readdirSync(path.join(root, 'kit-modules'), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
    );
  }

  const runSh = path.join(root, 'sh/dev/run.sh');
  const makeArgLimitsStale = !isFile(runSh) || STALE_RUN_SH_RE.test(fs.readFileSync(runSh, 'utf8'));

  return { root, targets, varCorpus, workflowNames, installedKitModules, makeArgLimitsStale };
}

/** Lazily built, once per foundation: every path under the root with its type. */
const relIndexCache = new WeakMap();
function relIndex(foundation) {
  let idx = relIndexCache.get(foundation);
  if (!idx) {
    idx = walk(foundation.root, '');
    relIndexCache.set(foundation, idx);
  }
  return idx;
}

/**
 * Does a (possibly placeholder-containing) foundation-relative path exist? Placeholders: segments
 * before the first placeholder segment are the concrete prefix and must exist; the rest becomes a
 * regex (each placeholder -> `[^/]+`, `**` -> any depth, literals escaped; `[...]` is a
 * placeholder, never a regex class) matched against the walk below the prefix. Zero matches still
 * count as ok when the only placeholder segment is the last one and is a pure `<..>`/`[..]`/`{..}`
 * placeholder (a user-chosen name): the folder that holds it was checked.
 *
 * @param {string} root
 * @param {string} value
 * @returns {boolean}
 */
function pathExists(root, value) {
  if (!PLACEHOLDER_RE.test(value)) return exists(path.join(root, value));

  const segs = value.split('/');
  const firstPh = segs.findIndex((s) => PLACEHOLDER_RE.test(s));
  const prefix = segs.slice(0, firstPh).join('/');
  if (prefix !== '' && !isDir(path.join(root, prefix))) return false;

  const rest = segs.slice(firstPh);
  const regexSrc = rest
    .join('/')
    .split(PLACEHOLDER_SPLIT_RE)
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return part === '**' ? '.+' : '[^/]+';
    })
    .join('');
  const re = new RegExp(`^${regexSrc}$`);

  const strip = prefix === '' ? 0 : prefix.length + 1;
  for (const { rel } of walk(root, prefix)) {
    if (re.test(rel.slice(strip))) return true;
  }
  return rest.length === 1 && PURE_PLACEHOLDER_RE.test(rest[0]);
}

function workflowExists(foundation, value) {
  if (!PLACEHOLDER_RE.test(value)) return foundation.workflowNames.has(value);
  const src = value
    .split(PLACEHOLDER_SPLIT_RE)
    .map((part, i) => (i % 2 === 0 ? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[^/]+'))
    .join('');
  const re = new RegExp(`^${src}$`);
  for (const name of foundation.workflowNames) if (re.test(name)) return true;
  return false;
}

function varExists(foundation, name) {
  const re = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
  return foundation.varCorpus.some((f) => re.test(f.text));
}

/** The `X` of "says `X` ...": the raw span plus ` (= value)` for an expanded `.../x/` span. */
function spanLabel(claim) {
  if (claim.anchor) return `${claim.raw} (= ${claim.value})`;
  return claim.raw.startsWith('`') ? claim.raw : `\`${claim.value}\``;
}

function label(claim) {
  return claim.anchor ? spanLabel(claim) : `\`${claim.value}\``;
}

function underRuntimeRoot(value) {
  return RUNTIME_CREATED_PATHS.find((r) => value === r || value.startsWith(`${r}/`)) ?? null;
}

function verifyPath(claim, foundation, strict) {
  const { value } = claim;
  if (claim.unresolved) {
    return {
      status: 'fail',
      message: `shortened path \`.../${value}\` has no full path before it in this section to expand from`,
    };
  }

  const segs = value.split('/');
  if (segs[0] === 'kit-modules' && segs.length > 1) {
    const mod = segs[1];
    const placeholder = PLACEHOLDER_RE.test(mod);
    const installed = foundation.installedKitModules;
    if (!placeholder && !KNOWN_KIT_MODULES.includes(mod)) {
      return {
        status: 'fail',
        message: `path ${label(claim)} names an unknown kit-module \`${mod}\` (known: ${KNOWN_KIT_MODULES.join(', ')})`,
      };
    }
    const missing = placeholder
      ? installed === null || installed.size === 0
      : installed === null || !installed.has(mod);
    if (missing) {
      return strict
        ? {
            status: 'fail',
            message: `kit-module \`${mod}\` is not installed in the foundation checkout (DOC_CLAIMS_REQUIRE_FOUNDATION=1)`,
          }
        : { status: 'skipped', message: `kit-module \`${mod}\` is not installed in the foundation checkout` };
    }
  } else {
    const rootRel = underRuntimeRoot(value);
    if (rootRel !== null && !exists(path.join(foundation.root, rootRel))) {
      return { status: 'runtime', message: `created at runtime under \`${rootRel}\`` };
    }
  }

  return pathExists(foundation.root, value)
    ? { status: 'ok', message: '' }
    : { status: 'fail', message: `path ${label(claim)} does not exist in the foundation checkout` };
}

function verifyRelpath(claim, foundation) {
  const noun = claim.raw.match(/` (directory|dir|folder|file)$/)?.[1] ?? null;
  const wanted = noun === null ? null : noun === 'file' ? 'file' : 'dir';
  const matches = relIndex(foundation)
    .filter(
      (e) =>
        (e.rel === claim.value || e.rel.endsWith(`/${claim.value}`)) &&
        (wanted === null || e.type === wanted),
    )
    .map((e) => e.rel);
  if (matches.length === 0) return { status: 'ok', message: '' };
  const shown = matches.slice(0, 3).map((m) => `\`${m}\``).join(', ');
  return {
    status: 'fail',
    message: `relpath says \`${claim.value}\` does not exist, but it exists in the foundation checkout as ${shown}`,
  };
}

function verifyOne(claim, foundation, strict) {
  switch (claim.kind) {
    case 'make':
      return foundation.targets.has(claim.value)
        ? { status: 'ok', message: '' }
        : { status: 'fail', message: `make target \`${claim.value}\` is not defined in ${foundation.root}/Makefile` };
    case 'make-args': {
      if (foundation.makeArgLimitsStale) {
        return { status: 'skipped', message: 'MAKE_ARG_LIMITS may be stale' };
      }
      const target = claim.value.split(' ')[0];
      const limit = MAKE_ARG_LIMITS[target];
      const extra = claim.args.slice(limit).join(' ');
      return {
        status: 'fail',
        message:
          `make ${target} takes at most ${limit} words (service, user): sh/dev/run.sh reads only $1..$3 ` +
          `(mode, service, user), so \`${extra}\` is silently dropped`,
      };
    }
    case 'path':
      return verifyPath(claim, foundation, strict);
    case 'relpath':
      return verifyRelpath(claim, foundation);
    case 'var':
      return varExists(foundation, claim.value)
        ? { status: 'ok', message: '' }
        : { status: 'fail', message: `variable \`${claim.value}\` not found in the foundation checkout (searched: ${VAR_SEARCHED})` };
    case 'workflow':
      return workflowExists(foundation, claim.value)
        ? { status: 'ok', message: '' }
        : { status: 'fail', message: `workflow file \`${claim.value}\` does not exist in the foundation checkout` };
    default:
      return { status: 'fail', message: `unknown claim kind \`${claim.kind}\`` };
  }
}

/**
 * Verify every claim against the foundation.
 *
 * - `make`: target defined in the Makefile. `make-args`: always fail (a claim exists only when the
 *   limit is exceeded) unless `makeArgLimitsStale`, then `skipped`.
 * - `path`: unresolved `.../x` fails; `kit-modules/<m>/...` needs a known, installed module
 *   (`skipped` when not installed, `fail` in `strict`; an unknown name always fails); runtime
 *   roots (see {@link RUNTIME_CREATED_PATHS}); otherwise existence with placeholder rules.
 * - `relpath` (always negated): fails when the suffix index finds a match.
 * - `var` / `workflow`: found in the corpus / workflow names.
 * - `negated` on `path` / `var` / `workflow` / `make`: ok and fail are swapped; `skipped` and
 *   `runtime` stay as they are.
 *
 * @param {object[]} claims
 * @param {NonNullable<ReturnType<typeof loadFoundation>>} foundation
 * @param {{strict?: boolean}} [opts]
 * @returns {{claim: object, status: 'ok' | 'fail' | 'skipped' | 'runtime', message: string}[]}
 */
export function verifyClaims(claims, foundation, { strict = false } = {}) {
  return claims.map((claim) => {
    const r = verifyOne(claim, foundation, strict);
    const swappable = ['make', 'path', 'var', 'workflow'].includes(claim.kind);
    if (claim.negated && swappable && (r.status === 'ok' || r.status === 'fail')) {
      return r.status === 'ok'
        ? {
            claim,
            status: 'fail',
            message: `${claim.kind} says ${spanLabel(claim)} does not exist, but it exists in the foundation checkout`,
          }
        : { claim, status: 'ok', message: '' };
    }
    return { claim, ...r };
  });
}

/**
 * One `fail` per Makefile target with no `make` claim in `referenceFile`'s table rows (a footnote
 * or prose mention does not count). The caller skips this entirely when the reference page is not
 * among the scanned files.
 *
 * @param {object[]} claims
 * @param {NonNullable<ReturnType<typeof loadFoundation>>} foundation
 * @param {{referenceFile?: string, referenceLine?: number}} [opts]
 * @returns {{claim: object, status: 'fail', message: string}[]}
 */
export function checkMakefileCoverage(
  claims,
  foundation,
  { referenceFile = 'makefile-reference.md', referenceLine = 1 } = {},
) {
  const documented = new Set(
    claims
      .filter((c) => c.kind === 'make' && c.file === referenceFile && c.context === 'table')
      .map((c) => c.value),
  );
  const results = [];
  for (const [target, line] of foundation.targets) {
    if (documented.has(target)) continue;
    results.push({
      claim: {
        kind: 'make-ref',
        value: target,
        raw: `Makefile:${line}`,
        file: referenceFile,
        line: referenceLine,
        negated: false,
        source: 'code',
        context: 'table',
        anchor: null,
        unresolved: false,
      },
      status: 'fail',
      message: `Makefile target \`${target}\` (Makefile:${line}) has no table row in ${referenceFile}`,
    });
  }
  return results;
}
