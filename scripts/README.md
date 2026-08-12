# scripts/ — Docs → WordPress sync

Converts every `.md` file listed in `../index.md` into `starter-kit/*`/`core/*`
block **node trees** (`{blockName, attrs, innerBlocks, innerHTML}`), serializes each file's tree
into Gutenberg block markup by POSTing it to the target site's own REST endpoint
(`POST /wp-json/skt/v1/serialize-blocks`, `starter-kit-addon`'s `BlockTreeSerializer`), and
publishes the resulting markup to the `doc-page` custom post type (REST base `/wp/v2/doc-page`).
The target site is whatever `WP_BASE_URL` is set to — the production site (`https://starter-kit.io`)
when run from CI, or a local dev install (e.g. `http://starter-kit.loc`) when run by hand. Runs
both by hand from this machine and from CI on every push to `master`
(`.github/workflows/publish-docs.yml`) — see "Publishing from CI" below.

**The sync script no longer decides block markup's byte shape.** `lib/blocks.mjs` and
`lib/convert.mjs` only build the node tree — delimiters, `core/` namespace stripping, `attrs`
JSON encoding, the `"\n\n"` sibling glue, and `wp_kses_post()` are all applied server-side by the
`skt/v1/serialize-blocks` endpoint. This means **the target site (`WP_BASE_URL`) must be reachable
for every run, including `--dry-run`** — markup generation itself is now a live network call, not
just the live-content diff.

## Target: `/wp/v2/doc-page`, not `/wp/v2/pages`

The site already publishes these docs as a custom post type, `doc-page` (hierarchical, REST base
`/wp/v2/doc-page`, rewrite slug `docs` baked into the post type's own registration — confirmed via
`wp eval 'print_r(get_post_type_object("doc-page"));'`). Publishing to `/wp/v2/pages` instead
would create a second, colliding set of posts at the same `/docs/<slug>/` URLs. There is **no
synthetic "docs" parent page/post** — `doc-page`'s rewrite slug already provides the `/docs/` URL
prefix. See `lib/wp.mjs`'s header comment for the full detail, including one open note: two of the
live `doc-page` posts (`advanced-installation-options`, `platform-notes`) have a non-zero
`post_parent` (pointing at `installation`), which this flat, single-level `index.md` manifest has
no way to express — this script never sends a `parent` field, so it neither reproduces nor
disturbs that existing hierarchy.

Slugs always follow the manifest-derived value (from the file's title in `index.md`), not any
previously-live slug — there is no indexing/SEO to preserve on this site, so no override
mechanism exists for slug mismatches. `https-and-local-certificates.md`'s live post was
renamed from its original `https-local-certificates` slug to match on 2026-08-11.

## Prerequisites

1. In wp-admin, create a `docs-publisher` role with only `edit_pages`, `edit_published_pages`,
   `publish_pages`, `edit_others_pages` — explicitly **not** `unfiltered_html`,
   `manage_options`, `edit_theme_options`, or plugin/user management. Assign it to a dedicated
   user. (Manual, wp-admin only — not built by this script.) `edit_pages` is also what the
   `skt/v1/serialize-blocks` endpoint itself requires, so this one role covers both the
   serialization call and the `doc-page` publishing calls — no separate permission to grant.
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

## Running

```bash
# Dry run: serializes each file's node tree via the live skt/v1/serialize-blocks endpoint,
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

Every file's node tree is first POSTed to `skt/v1/serialize-blocks` to obtain its markup, then
processed independently by the rest of the pipeline. If that POST fails for one file (e.g. a
malformed node tree — a 400 names the offending block by path in the response), that file alone
is reported as `✗ failed: <slug>: <error>` and skipped entirely (never published with empty or
partial content); the run continues with the remaining files. Exit code is non-zero if any file
failed this way, if any `doc-page` publish/draft call failed, or, with `--strict`, if any
converter warning was emitted.

## Tests

```bash
cd scripts && npm test
# equivalent: node --test
```

Four offline test files, no credentials, no network:

- `test/manifest.test.mjs` — manifest parsing/ordering (`index.md`'s 18 entries, in order, with
  matching slugs), plus the link-target/file-existence error paths.
- `test/inline.test.mjs` — inline HTML rendering, link rewriting, and entity escaping.
- `test/convert.test.mjs` — token-stream → node-tree mapping, including the split-and-warn cases.
- `test/blocks.test.mjs` — every block emitter (`paragraph`, `heading`, `listSection`/`listItem`,
  `code`, `quote`, `table`, `separator`, `embed`), asserted by node-shape deep-equality
  (`{blockName, attrs, innerBlocks, innerHTML}`), not markup-string matching.

`npm test` should always report `pass 38, fail 0, skipped 0` — zero skips, since none of these
tests hold credentials or touch the network.

**Byte-level verification against the live endpoint now happens via `npm run sync:dry`**, not via
a dedicated test: it serializes every file in `index.md` through the live
`skt/v1/serialize-blocks` endpoint and diffs the result against that page's current live
`content.raw`, for all 18 pages, every time it's run — see "Running" above.

## What `docs-sync-map.json` is, and why it's committed

A path → WordPress `doc-page` post ID map (`{"usage.md": {"id": 50, "slug": "usage"}}`), used
instead of custom post meta: it needs zero server-side PHP changes in `starter-kit-foundation`, at
the cost of being a cache rather than the sole source of truth — before creating a post, the
script probes `GET /wp/v2/doc-page?slug=<slug>` and adopts a match instead of creating a
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

`.github/workflows/publish-docs.yml` runs on every push to `master` (no path filter — the set of
inputs that changes published output is bigger than just `*.md`, and a no-op run is cheap and
side-effect-free) and via manual `workflow_dispatch` with a `dry_run` boolean input. Two jobs:

- `test` — checkout, `npm ci`, `npm test`. No secrets referenced. Gates `sync`: a broken node
  builder or manifest parse can never reach a live write request.
- `sync` — `needs: test`. Runs `npm run sync:dry` (informational, always runs, never fails the
  job on a non-empty diff — see "Running" above), then `node sync-docs.mjs --frozen-map` (skipped
  when `workflow_dispatch`'s `dry_run` input is `true`). **Never runs with `--strict`** — the doc
  set has three known, intentional converter warnings (an ordered list split by a nested code
  fence) that would fail every single run. Both steps' output is teed to a file and appended to
  the run's summary (`$GITHUB_STEP_SUMMARY`) so success or failure is legible without opening
  logs.

### Repository secrets

The `sync` job reads three repository secrets into `WP_BASE_URL` / `WP_USER` /
`WP_APP_PASSWORD` — the same three environment variables described under "Prerequisites" above.
Create them once: repo **Settings → Secrets and variables → Actions → New repository secret**,
one secret per variable, using the `docs-publisher` user's Application Password for
`WP_APP_PASSWORD`.

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

- The `docs-publisher` role and an Application Password for it (see "Prerequisites" above — this
  is the same one-time wp-admin setup, just performed against the production site
  (`https://starter-kit.io`) instead of a local dev install).
- The `skt/v1/serialize-blocks` endpoint (`starter-kit-addon`) present and reachable.
- The `doc-page` custom post type registered, REST base `/wp/v2/doc-page`.

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
overwrites `title`/`content`/`slug`/`menu_order` with what's generated from this repo (`parent`
is never touched — see "Target: `/wp/v2/doc-page`" above). Any edit made directly in wp-admin is
silently lost on the next run. If you need to change a doc page's content, edit the `.md` file in
this repo, not the page in wp-admin.

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

# 3. Idempotency: run the sync twice in a row; the second run should report 18x "unchanged" and
#    change no post_modified value:
docker exec starter-kit-php wp --path=/srv/web --allow-root post list \
  --post_type=doc-page --fields=ID,post_modified
```

Then, in the browser: open `/docs/installation/` (renders correctly) and open it in the Gutenberg
editor (no "this block contains unexpected or invalid content" warning on any block — pay
particular attention to list blocks and `core/table`).
