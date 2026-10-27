# scripts/ — Docs → WordPress sync

Converts every `.md` file listed in `../index.md` into `starter-kit/*`/`core/*`
block **node trees** (`{blockName, attrs, innerBlocks, innerHTML}`), serializes each file's tree
into Gutenberg block markup by POSTing it to the target site's own REST endpoint
(`POST /wp-json/ska/v1/serialize-blocks`, `starter-kit-addon`'s `BlockTreeSerializer`), and
publishes the resulting markup to the `doc-page` custom post type (REST base `/wp-json/ska/v1/doc-page`).
The target site is whatever `WP_BASE_URL` is set to — the production site (`https://starter-kit.io`)
when run from CI, or a local dev install (e.g. `http://starter-kit.loc`) when run by hand. Runs
both by hand from this machine and from CI on every push to `main`
(`.github/workflows/publish-docs.yml`) — see "Publishing from CI" below.

**The sync script no longer decides block markup's byte shape.** `lib/blocks.mjs` and
`lib/convert.mjs` only build the node tree — delimiters, `core/` namespace stripping, `attrs`
JSON encoding, the `"\n\n"` sibling glue, and `wp_kses_post()` are all applied server-side by the
`ska/v1/serialize-blocks` endpoint. This means **the target site (`WP_BASE_URL`) must be reachable
for every run, including `--dry-run`** — markup generation itself is now a live network call, not
just the live-content diff.

## Target: `/ska/v1/doc-page`, not `/wp/v2/pages`

The site already publishes these docs as a custom post type, `doc-page` (hierarchical, registered
under the `ska/v1` REST namespace — REST base `/wp-json/ska/v1/doc-page` — rewrite slug `docs`
baked into the post type's own registration — confirmed via
`wp eval 'print_r(get_post_type_object("doc-page"));'`). Publishing to `/wp/v2/pages` instead
would create a second, colliding set of posts at the same `/docs/<slug>/` URLs. There is **no
synthetic "docs" parent page/post** — `doc-page`'s rewrite slug already provides the `/docs/` URL
prefix. See `lib/wp.mjs`'s header comment for the full detail, including one open note: two of the
live `doc-page` posts (`advanced-installation-options`, `platform-notes`) have a non-zero
`post_parent` (pointing at `installation`), which this flat, single-level `index.md` manifest has
no way to express — this script never sends a `parent` field, so it neither reproduces nor
disturbs that existing hierarchy.

The post type used to be registered under core's `wp/v2` namespace, and this script used to target
`/wp/v2/doc-page` — moved to `skt/v1` by `starter-kit-addon`'s `docs-publisher-role` plan, so the
CI publishing identity no longer needs the core `edit_pages` capability just to pass the theme's
REST API whitelist — and later to the addon's own `ska/v1` namespace (`SKA_REST_API_NS`), so the
addon no longer depends on the theme's `SK_REST_API_NS` constant; the theme's whitelist is extended
through the `{SK_HOOKS_PREFIX}/rest_api_namespace_whitelist` filter. **Deploy-ordering note:**
this script and `starter-kit-addon` must agree on the namespace. If the addon on the target site
still registers `doc-page` / `serialize-blocks` under `skt/v1` (older addon), or this script still
targets `skt/v1` while the addon is already on `ska/v1`, every request here 404s with
`rest_no_route` against `/wp-json/ska/v1/...` — self-healing, not destructive, since no write ever
partially succeeds; it simply starts working again on the next run once both sides match.

Slugs always follow the manifest-derived value (from the filename itself — `file.slice(0, -3)`,
in `lib/manifest.mjs`), not any previously-live slug and not any title — there is no indexing/SEO
to preserve on this site, so no override mechanism exists for slug mismatches.
`https-and-local-certificates.md`'s live post was renamed from its original
`https-local-certificates` slug to match on 2026-08-11.

`post_title` comes from each file's own first `# Heading` — the file, not `index.md`, is the
single source of truth for a page's title (`lib/convert.mjs` captures it as plain text; see
`lib/inline.mjs`'s `inlineToPlainText()`). `index.md`'s TOC link text is display-only
(`lib/manifest.mjs`'s `tocTitle` field) and should mirror that heading by convention, so `index.md`
stays legible as a table of contents on GitHub — it is never sent to WordPress. If a file's heading
and its `index.md` TOC text drift apart, `sync-docs.mjs` prints a non-fatal
`WARN index.md:<line> TOC text "..." does not match <file>'s own title heading "..."` warning (and
aborts under `--strict`); fix it by editing `index.md`'s TOC entry to match the file's heading —
never the other way round.

## Prerequisites

1. The `docs-publisher` role is provided automatically by `starter-kit-addon` — it creates the
   role from the plugin's **activation hook**, so it needs no manual role setup on any target
   site. Note that deploying the plugin by copying files onto a site where it is already active
   does not fire that hook (`wp plugin activate` on an already-active plugin is a no-op); after
   such a deploy, and after any future change to the capability set, reactivate it once on that
   site: `wp plugin deactivate starter-kit-addon && wp plugin activate starter-kit-addon`.
   It holds `read` plus the ten doc-page-scoped primitives
   (`edit_doc_pages`, `edit_others_doc_pages`, `edit_published_doc_pages`,
   `edit_private_doc_pages`, `publish_doc_pages`, `read_private_doc_pages`, `delete_doc_pages`,
   `delete_others_doc_pages`, `delete_published_doc_pages`, `delete_private_doc_pages`) —
   explicitly **not** `edit_pages`/`edit_published_pages`/`publish_pages`/`edit_others_pages` or
   any other core Page capability, so it cannot touch core WP Pages at all, and explicitly not
   `unfiltered_html`, `manage_options`, `edit_theme_options`, or plugin/user management. The only
   manual steps left are: assign the role to a dedicated user (Users → Add New, or edit an
   existing user's role). `edit_doc_pages` is also what the `ska/v1/serialize-blocks` endpoint
   itself requires, so this one role covers both the serialization call and the `doc-page`
   publishing calls — no separate permission to grant.
2. For that user: Users → Profile → Application Passwords → generate one.
3. Export before running:
   ```bash
   export WP_BASE_URL=http://starter-kit.loc   # local dev; use https://starter-kit.io for prod
   export WP_USER=<that user's login>
   export WP_APP_PASSWORD=<the generated password>
   ```
   The script reads exactly these three and nothing else. It fails fast with a clear message
   (no stack trace) if any is unset, and never logs the password.
4. `cd scripts && npm install` (installs `markdown-it`; requires Node ≥ 20).
5. Optional but recommended: `git config core.hooksPath .githooks` (once per checkout) enables a
   pre-commit hook that runs two offline checks, both always, and blocks the commit if either
   fails: `scripts/check-title-drift.mjs` (`index.md`'s TOC text must match each file's own
   `# heading`; same check `sync-docs.mjs` warns about at publish time, run early instead of
   first noticed in CI) and `scripts/check-doc-claims.mjs` (doc claims verified against the
   foundation checkout, see "Doc claims check"). The foundation is found via `FOUNDATION_PATH`,
   else `../starter-kit-foundation.loc` next to this checkout, else next to the main checkout
   (so it also works in git worktrees). Without a foundation checkout the claims check prints a
   WARNING and passes; `DOC_CLAIMS_REQUIRE_FOUNDATION=1` makes that a failure. No WP credentials
   needed. Not auto-installed by `git clone`: git only runs hooks from `.git/hooks` by default,
   which isn't versioned, so `.githooks/` is opt-in per clone.

## Running

```bash
# Dry run: serializes each file's node tree via the live ska/v1/serialize-blocks endpoint,
# writes the resulting markup to .sync-output/<slug>.html, and prints a diff against the live
# page's content.raw (?context=edit). NEVER calls a write endpoint.
npm run sync:dry
# equivalent: node sync-docs.mjs --dry-run

# Live sync: creates/updates pages, drafts pages removed from index.md, commits
# docs-sync-map.json's new state to disk (you still need to `git add`/commit it yourself).
npm run sync
# equivalent: node sync-docs.mjs

# --strict: treat converter warnings (e.g. an ordered list split by a nested code block) as
# fatal. Checked before any network call, including the serialize-blocks call — a --strict
# abort issues zero requests.
node sync-docs.mjs --dry-run --strict
```

Every file's node tree is first POSTed to `ska/v1/serialize-blocks` to obtain its markup, then
processed independently by the rest of the pipeline. If that POST fails for one file (e.g. a
malformed node tree — a 400 names the offending block by path in the response), that file alone
is reported as `✗ failed: <slug>: <error>` and skipped entirely (never published with empty or
partial content); the run continues with the remaining files. Exit code is non-zero if any file
failed this way, if any `doc-page` publish/draft call failed, or, with `--strict`, if any
converter warning was emitted.

## Doc claims check

`node check-doc-claims.mjs` (run from `scripts/`) pulls checkable claims out of every root `*.md`
page and verifies each one against the `starter-kit-foundation` checkout. Only root pages are
scanned: `CLAUDE.md` and `README.MD` are skipped, directories (`scripts/`, `.claude/`, `.github/`)
are never entered. It reads the foundation, never writes to it.

**What it checks**

- `make <target>`: the target is defined in the foundation `Makefile`. Found in inline code, fenced
  code and **bold** text, only at the start of a command (also after `VAR=value ` prefixes), so
  `sudo apt install make git` and "make sure" are ignored.
- `make exec` / `make run` argument counts: more than 2 words after the target fails, because
  `sh/dev/run.sh` reads only `$1..$3` (mode, service, user) and silently drops the rest. If
  `run.sh` starts reading more arguments the check is skipped with a WARN instead of failing.
- Repo paths in inline code that start with `kit-modules/`, `sh/`, `config/`, `dockerfiles/`,
  `.github/` or `.gitlab/`, with placeholders (`<env>`, `{$name}`, `*`, `**`) matched against the
  tree.
- Shortened paths (`.../stage/`): expanded from the nearest full path before it (same paragraph,
  else same section), then checked like any path. With no full path before it, that is a failure.
- Negated wording ("there is no `.../stage/` directory", "`envs/stage` does not exist"): the check
  is inverted, so the claim fails when the thing really exists. A relative path with no known
  prefix (`envs/stage`), or a bare word followed by "directory" / "dir" / "folder" / "file", is
  checked only in this negated form, by path suffix against the whole foundation tree.
- Env var names in inline code (`APP_NAME`, `TF_VAR_...`, `APP_DOMAIN=<x>`): found in
  `config/environment` (not `.env.secret` or `*override*`), `sh/env`, `docker-compose*.yml`,
  `Makefile`, `dockerfiles`, `.github`, `.gitlab-ci.yml`, `.gitlab`. `*.md` files are never searched.
- Workflow file names in inline code (`job-deploy.yml`, `docker-compose*.yml`).
- Coverage: every Makefile target has a `make` mention in a table row of `makefile-reference.md`
  (a footnote or prose mention does not count).

**What it does not catch**: the checker verifies existence only (a target, path, variable or file is
there), not behaviour (what a command does, which value wins, whether a restart applies config). The
real errors of the MariaDB trial run were all behavioural. In detail: default values or flag
meanings; wrong paths in prose without backticks; paths inside fenced blocks (they show what a command creates); non-negated
relative paths with no known prefix (`web/wp-core/`); argument handling of targets other than
`exec` / `run`; a variable that the foundation mentions only in a comment (it counts as found).
Those stay with the `make-doc` skill (claim list, running commands, cold read). Its "Verified test
recipes" section points to the self-cleaning Docker scripts for behaviour checks in `recipes/*.sh`, and its
"Known pitfalls" section points to `known-pitfalls.md`, which lists the behavioural mistakes already
seen, with the code lines to read.

**Foundation lookup order**: `FOUNDATION_PATH` (used alone; a relative value resolves against the
repo root), else `../starter-kit-foundation.loc` next to this checkout, else the same sibling next
to the main checkout (found via `git rev-parse --git-common-dir`, so git worktrees work). The
success line names the path and how it was found (`[env]`, `[sibling]`, `[main-checkout-sibling]`).
A kit-module that is not installed there (`kit-modules/proxy/...`) is skipped with a WARN; an
unknown module name (a typo) always fails.

**`DOC_CLAIMS_REQUIRE_FOUNDATION=1`** (strict): "foundation not found" and "kit-module not
installed" become failures. Without it, a missing foundation prints a stderr `WARNING ... claims NOT
verified` and exits 0, so a contributor without the checkout can still commit. Any other value
means lenient.

**Allowlist** `doc-claims-allowlist.txt`: one entry per line, `<file> <kind> <value>  # <reason>`
(the reason is mandatory; for `make-args` the value contains spaces: everything between the kind
and the `  #`). `<file>` is a doc page (`usage.md`), so an entry suppresses one claim on one page
only. Kinds: `make`, `make-args`, `path`, `relpath`, `var`, `workflow`, `make-ref`. Two sections:

- `[allowed]`: legitimate non-matches (an external name, a value the user creates). Never real drift.
- `[known-drift]`: REAL drift in the docs that is not fixed yet. Does not block, but is printed to
  stderr in a `KNOWN DRIFT` block on every run and counted in the success line. Never use it to hide
  drift: it must be fixed or reported.

An entry that matches nothing prints `WARN ... entry never matched — remove it`. A malformed
allowlist exits 1 with `doc-claims-allowlist.txt:<n>: ...`.

**Options**: `--docs-root=<dir>` (default: the repo root), `--allowlist=<file>`,
`--list-claims[=<file.md>]` (after the normal checks, print one tab-separated line per claim with
`location kind value status raw`, passing ones included; `unverified` without a foundation; a
file that is not a scanned page exits 1), `--write-audit-list=<file.md>` (write that page's claims as
a `make-doc` audit table, columns `doc:line | claim | checker | ground truth path:line | audit status |
notes`, to `<docs-root>/.claude/doc-audit/<page>.claims.md`; the directory is created and the file
overwritten on every run; it is written even when the run exits 1, `unverified` rows without a
foundation in lenient mode, nothing in strict mode without one; prints `wrote <path> (<n> claims)`;
a bare or empty flag, or a file that is not a scanned page, exits 1 and writes nothing). It combines
with `--list-claims`.

**Exit codes**: `0` all claims verified (known drift, skips and warnings allowed, or the foundation
is missing in lenient mode); `1` unverified claims, an invalid allowlist or argument, a bad
`--list-claims` or `--write-audit-list` value, or a missing foundation in strict mode.

```bash
DOC_CLAIMS_REQUIRE_FOUNDATION=1 node check-doc-claims.mjs
DOC_CLAIMS_REQUIRE_FOUNDATION=1 node check-doc-claims.mjs --list-claims=usage.md
DOC_CLAIMS_REQUIRE_FOUNDATION=1 node check-doc-claims.mjs --write-audit-list=usage.md
```

**Verification markers** `doc-audit-verified.txt`: read by the `make-doc` skill, not by any script
here. One line per doc area, `<area-key> <foundation-sha> <YYYY-MM-DD>`, recording the foundation
commit the area's docs were last fully verified against. The skill uses it to decide which areas
a request like "update docs from the latest commits" must cover; an area without a line is
treated as never audited.

## make-doc gate

`node make-doc-gate.mjs` (run from `scripts/`) is the zero-token mechanical gate of the `make-doc`
skill. It does not replace the pre-commit hook; the hook is unchanged. One line per item
(`PASS`, `FAIL` or `WARN`, then the check name), exit `1` if any line is a `FAIL`. Every check runs
even when an earlier one failed.

```bash
node make-doc-gate.mjs --init                       # save the converter-warning baseline
node make-doc-gate.mjs --compare-baseline [--scope-docs=a.md,b.md]
node make-doc-gate.mjs --claims=database-management.md --claims=troubleshooting.md:315-390
```

Common options: `--docs-root=<dir>` (default: the repo root), `--allowlist=<file>` (passed to
`check-doc-claims.mjs`, default: its own allowlist). Env: `FOUNDATION_PATH` (passed through),
`MAKE_DOC_GATE_NODE_MODULES` (tests: the node_modules directory to check).

- **setup** (every mode, first): `<scripts>/node_modules/markdown-it` must exist, else
  `FAIL setup: scripts/node_modules missing — run (cd scripts && npm ci)` and exit 1, nothing else
  runs. The gate's own static imports are `node:` builtins only, because the libs it needs load
  `markdown-it`.
- **foundation line**: `foundation: <path> @ <sha> (clean|dirty)`, or `(not a git repo)` when the
  checkout is not a git repo, or `FAIL foundation: not found (...)`. Same lookup as the claims
  check.
- **`--init`**: prints the foundation line and writes the converter baseline to
  `<docs-root>/.claude/doc-audit/converter-baseline.json` (gitignored):
  `{ "<file>": ["<warning text without file:line>", ...] }`.
- **`--compare-baseline`**:
  - `claims`: `check-doc-claims.mjs` as a child process, strict
    (`DOC_CLAIMS_REQUIRE_FOUNDATION=1`). The output is parsed even when the exit code is 1.
    `PASS claims: <N> verified (strict), <D> known drift`; one `FAIL claims:` per failure line;
    stdout `WARN` lines become `WARN claims:`, each KNOWN DRIFT entry `WARN known-drift:`.
  - `title-drift`: the same check as `check-title-drift.mjs` (shared `lib/title-drift.mjs`).
  - `converter`: converter warnings (which `check-title-drift.mjs` never prints) against the
    baseline, per file as a multiset with the line numbers removed, so a warning that only moved is
    not new. No baseline file is a FAIL ("run --init before editing").
  - `links`: every relative `*.md` link in `index.md` and its pages must resolve to a file, and its
    `#anchor` to a heading slug of the target (`lib/links.mjs`; lowercase, keep letters, digits,
    space, `-`, `_`; duplicates get `-1`, `-2`; leading hyphens are ignored, so emoji headings match
    with or without one). Bare `#anchor` links are checked against the same file.
  - `excluded-terms`: `is_demo`, `starter-kit-addon`, `stripe` (whole word), `docs-publisher`,
    `skt/v1`, case-insensitive, over `index.md` and its pages.
  - `live-hosts`: any `starter-kit.io` host except `licensing.starter-kit.io` and the bare
    `starter-kit.io` (no subdomain, no path other than `/`, with or without the scheme).
  - `versions` (WARN only): `x.y.z` literals in `--scope-docs` (default: all pages) that appear
    nowhere under the foundation's `config/environment`, `dockerfiles`, `docker-compose*.yml` or
    `.github`. Four-part numbers (IP addresses) are ignored.
- **`--claims=<doc>[:<from>-<to>]`** (repeatable): one `check-doc-claims.mjs --list-claims=<doc>`
  run per doc; rows whose line is in the range go to
  `<docs-root>/.claude/doc-audit/<doc>.claims.tsv` (`location kind value status`, no `raw`
  column). Written even when the checker exited 1. Prints
  `wrote <path> (<n> claims, <f> not verified, lines a-b)`; `<f>` counts rows with status `fail`.
  Only the claim check runs in this mode.

The parser depends on the checker's output shape (the `WARN` prefix, the TSV header, the KNOWN
DRIFT and failure blocks on stderr, the success line); `test/make-doc-gate.test.mjs` runs the real
checker, so a change there fails `npm test`.

## Tests

```bash
cd scripts && npm test
# equivalent: node --test
```

Nine offline test files, no credentials, no network:

- `test/manifest.test.mjs` — manifest parsing/ordering (`index.md`'s 19 entries, in order, with
  matching slugs), the `tocTitle`/`line` fields, plus the link-target/file-existence error paths.
- `test/inline.test.mjs` — inline HTML rendering, link rewriting, entity escaping, and
  `inlineToPlainText()` (the title extractor — plain text, raw `&`, markup stripped, hard breaks
  joined).
- `test/convert.test.mjs` — token-stream → node-tree mapping, including the split-and-warn cases
  and the captured `title`.
- `test/blocks.test.mjs` — every block emitter (`paragraph`, `heading`, `listSection`/`listItem`,
  `code`, `quote`, `table`, `separator`, `embed`), asserted by node-shape deep-equality
  (`{blockName, attrs, innerBlocks, innerHTML}`), not markup-string matching.
- `test/wp.test.mjs` — `syncPage()`'s unchanged-check (including the `title.raw` comparison) and
  its non-empty-title guard, against a stubbed REST client.
- `test/claims.test.mjs` — `lib/claims.mjs`'s Markdown → claim extraction (`make` at command start,
  `make exec|run` argument counts, `path`/`relpath`/`var`/`workflow` claims, shortened `.../x/`
  expansion incl. the verbatim past callout from commit a5b9f2e, negation wording, `context` and
  exact line numbers) and `parseAllowlist()`'s sections, keys and every parse-error case, all on
  inline synthetic Markdown.
- `test/check-doc-claims.test.mjs` — `lib/foundation.mjs` and the `check-doc-claims.mjs` CLI against
  a mini foundation and synthetic doc pages built in a temp dir (never the live foundation): the
  six real past drift cases at exact `file:line`, corrected versions, runtime-created and
  kit-module rules, placeholder paths, stale `make exec|run` limits, `resolveFoundationPath()`,
  allowlist / `[known-drift]` behaviour, strict mode, `--list-claims` and `--write-audit-list`
  (columns, directory creation, overwrite, rejected values, lenient mode, zero-claim page).
- `test/make-doc-skill.test.mjs` — placeholder guard for `.claude/skills/make-doc/SKILL.md`. The
  skill harness substitutes argument placeholders into skill text, which corrupted prose in a trial
  run. Convention: the full-arguments token occurs exactly once, on the line
  `**Arguments:** <token>`, and the positional digit tokens (a dollar sign followed by a digit,
  braced or not) are forbidden everywhere; describe arguments in words, the backslash escape is not
  used. A failure names the offending line numbers. It also guards the recipe scripts in
  `recipes/*.sh` (no published ports, prune, `container_name` or `ports:`; `--pull=never` and
  `pull_policy: never`; `trap cleanup EXIT`; `bash -n`), that every supporting file SKILL.md names
  exists, and that every in-file anchor link in SKILL.md resolves to a heading. Covers `make-doc`
  only.
- `test/make-doc-gate.test.mjs` — `make-doc-gate.mjs` as a child process against a synthetic docs
  root and a mini foundation (not a git repo) in temp dirs, with a temp allowlist (never the real
  one): links and anchors (file, anchor, emoji heading), excluded terms, live hosts, converter
  baseline (new vs shifted warning, missing baseline), version WARN, `--claims` range and
  TSV-despite-exit-1, claims failure not stopping the other checks, KNOWN DRIFT and WARN lines, the
  foundation line, and the missing-node_modules setup failure.

`npm test` should always report `pass 174, fail 0, skipped 0` — zero skips, since none of these
tests hold credentials or touch the network.

**Byte-level verification against the live endpoint now happens via `npm run sync:dry`**, not via
a dedicated test: it serializes every file in `index.md` through the live
`ska/v1/serialize-blocks` endpoint and diffs the result against that page's current live
`content.raw`, for all 19 pages, every time it's run — see "Running" above.

## What `docs-sync-map.json` is, and why it's committed

A path → WordPress `doc-page` post ID map (`{"usage.md": {"id": 50, "slug": "usage"}}`), used
instead of custom post meta: it needs zero server-side PHP changes in `starter-kit-foundation`, at
the cost of being a cache rather than the sole source of truth — before creating a post, the
script probes `GET /wp-json/ska/v1/doc-page?slug=<slug>` and adopts a match instead of creating a
duplicate, so a lost/corrupt map self-heals (slower, one extra request per page, but correct). It
ships pre-seeded with the real `doc-page` IDs for every file currently in `index.md` (fetched via
`wp post list --post_type=doc-page --fields=ID,post_name`); a newly added doc file has no entry
until its first sync run creates (or adopts) the post.

It is committed so:
- Every operator's run starts from the same known page-ID state (no local-only drift).
- `git diff scripts/docs-sync-map.json` is a review signal: new pages appearing, or none, tells
  you whether a run actually created anything.
- Entries are **never deleted**, even when a file is removed from `index.md` — the entry is what
  lets the draft-on-removal pass (below) find that page on every subsequent run.

**CI and the map: frozen by design, not by omission.** The pipeline runs from a hosted GitHub
Actions runner and cannot commit an updated map back to git, so it always passes `--frozen-map`
(see `--help` above). This is safe, not a stopgap: `syncPage()` probes by slug before creating
anything, so a doc file with no map entry is adopted by slug on the *next* run instead of being
duplicated — the map is a cache, not the source of truth for identity. The one thing this changes
for an operator: after adding a **new** doc file, run `npm run sync` once locally (without
`--frozen-map`) and commit the updated `docs-sync-map.json`, so `draftRemovedPages()` can find
that page by map entry if the file is ever later removed from `index.md`. See "Publishing from
CI" below.

## Publishing from CI

`.github/workflows/publish-docs.yml` runs on every push to `main` or `develop` (no path filter
— the set of inputs that changes published output is bigger than just `*.md`, and a no-op run is
cheap and side-effect-free) and via manual `workflow_dispatch` with a `dry_run` boolean input. Two
jobs:

- `test` — checkout, `npm ci`, `npm test`. No secrets referenced. Gates `sync`: a broken node
  builder or manifest parse can never reach a live write request.
- `sync` — `needs: test`. Runs `npm run sync:dry` (informational, always runs, never fails the
  job on a non-empty diff — see "Running" above), then `node sync-docs.mjs --frozen-map` (skipped
  when `workflow_dispatch`'s `dry_run` input is `true`). **Never runs with `--strict`** — the doc
  set has three known, intentional converter warnings (an ordered list split by a nested code
  fence) that would fail every single run. Both steps' output is teed to a file and appended to
  the run's summary (`$GITHUB_STEP_SUMMARY`) so success or failure is legible without opening
  logs.

### Two targets, one per branch: GitHub Environments, not repository secrets

`sync` sets `environment: ${{ github.ref_name == 'main' && 'production' || 'development' }}` —
`main` resolves to the `production` GitHub Environment (`starter-kit.io`), `develop` to
`development` (`develop.starter-kit.io`). `WP_BASE_URL` / `WP_USER` / `WP_APP_PASSWORD` must be
**environment secrets** (Settings → Environments → *env* → Environment secrets), not repository
secrets — a repository secret has one value shared by every branch, which would publish both
branches to the same site. Same secret *names*, different values per environment, same idea as
the app repos' GitLab CI environment-scoped variables (see `../ci-cd-deployments.md`).

Each target site needs its own dedicated user assigned the `docs-publisher` role (created
automatically by `starter-kit-addon`, see "Prerequisites" above) plus an Application Password for
that user (performed once per site). Because `docs-sync-map.json` is keyed by base URL (see below),
the very first CI run against a target with no existing map entry for it adopts each page by
slug instead of creating a duplicate if a matching post already exists there, or creates it fresh
if it doesn't — safe either way, just one extra probe request per page on that first run.

### HTTPS is a hard requirement for a CI target

A local dev install (e.g. `starter-kit.loc`) authenticates with Application Passwords over plain
`http://` only because its WordPress `environment_type` is `local`:

```php
function wp_is_application_passwords_supported() {
	return is_ssl() || 'local' === wp_get_environment_type();
}
```

(`wp-core/wp-includes/user.php`). That exemption does not travel to a real, hosted target. If
`WP_BASE_URL` points at anything other than a `local`-environment install, it **must** be
`https://` or every request will fail authentication with an
`application_passwords_disabled`-shaped error, not a helpful one.

### Target site prerequisites

Whatever site `WP_BASE_URL` points at must already have, independent of this workflow:

- `starter-kit-addon` active (it provides the `docs-publisher` role automatically) and a dedicated
  user assigned that role, with an Application Password generated for it (see "Prerequisites"
  above — the only manual, one-time wp-admin setup, performed once per target site: production
  `https://starter-kit.io` and development `https://develop.starter-kit.io`).
- The `ska/v1/serialize-blocks` endpoint (`starter-kit-addon`) present and reachable.
- The `doc-page` custom post type registered, REST base `/wp-json/ska/v1/doc-page`.

### If the target isn't reachable from a GitHub-hosted runner

`runs-on: ubuntu-latest` can only reach a publicly resolvable host. If `WP_BASE_URL` is only
reachable on a private network (e.g. a LAN-only staging box), change `runs-on:` on the `sync` job
to a self-hosted runner label — nothing else in the workflow needs to change.

### The map stays frozen in CI

`sync` always passes `--frozen-map`: CI cannot commit `docs-sync-map.json` back to the repo. This
is safe by construction (see "What `docs-sync-map.json` is, and why it's committed" above) — a
newly created page is adopted by slug on its next run rather than duplicated. The one follow-up
an operator owes after adding a brand-new doc file: run `npm run sync` once locally (without
`--frozen-map`) and commit the resulting map update, so a later removal of that file from
`index.md` can still be found and drafted.

### Notifications

GitHub does **not** guarantee email notifications on a failed run by default — it's an opt-in
setting ("Email" under Actions notification preferences, with an "Only notify for failed
workflows" checkbox). Verify your own notification setting once
(github.com → profile → Settings → Notifications → Actions) rather than assuming a failed publish
will reach your inbox unprompted. The Actions tab and the run summary are the reliable source of
truth regardless.

## One-way sync — read this if you have WP admin access

Sync direction is **git → WordPress only**. A synced page can technically be opened and edited in
Gutenberg (these are real native blocks, not a classic-HTML blob) — but the next sync run always
overwrites `title` (from the file's own first `# Heading`), `content`, `slug` (from the filename),
and `menu_order` (from `index.md`'s position) with what's generated from this repo (`parent`
is never touched — see "Target: `/ska/v1/doc-page`" above). Any edit made directly in wp-admin is
silently lost on the next run. If you need to change a doc page's title or content, edit the `.md`
file in this repo, not the page in wp-admin.

## Verifying a run (WP-CLI, not the browser)

Primary verification is WP-CLI reading the stored bytes directly — a browser reads a rendering
of them through theme CSS, which is slower and, for markup-correctness questions, less truthful.
Browser checks are a supplement for exactly two questions: does the front end render correctly,
and does the editor raise no block-validation warning.

```bash
# 1. All synced doc-page posts, in menu_order:
docker exec starter-kit-php wp --path=/srv/web --allow-root post list \
  --post_type=doc-page \
  --fields=ID,post_name,menu_order,post_status --orderby=menu_order

# 2. Raw stored markup + a sanity check that nothing failed to parse (a `null` blockName among
#    non-whitespace content means unparsed HTML leaked into the stream — an automatic fail):
docker exec starter-kit-php wp --path=/srv/web --allow-root post get <id> --field=post_content
docker exec starter-kit-php wp --path=/srv/web --allow-root eval \
  'print_r(array_unique(array_column(parse_blocks(get_post(<id>)->post_content),"blockName")));'

# 3. Idempotency: run the sync twice in a row; the second run should report 19x "unchanged" and
#    change no post_modified value:
docker exec starter-kit-php wp --path=/srv/web --allow-root post list \
  --post_type=doc-page --fields=ID,post_modified
```

Then, in the browser: open `/docs/installation/` (renders correctly) and open it in the Gutenberg
editor (no "this block contains unexpected or invalid content" warning on any block — pay
particular attention to list blocks and `core/table`).
