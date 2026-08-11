# scripts/ — Docs → WordPress sync

Converts every `.md` file listed in [`../index.md`](../index.md) into `starter-kit/*`/`core/*`
block **node trees** (`{blockName, attrs, innerBlocks, innerHTML}`), serializes each file's tree
into Gutenberg block markup by POSTing it to `starter-kit.loc`'s own REST endpoint
(`POST /wp-json/skt/v1/serialize-blocks`, `starter-kit-addon`'s `BlockTreeSerializer`), and
publishes the resulting markup to the `doc-page` custom post type (REST base `/wp/v2/doc-page`).
Stage 1 only (see `../.claude/plans/architect-plan-docs-sync-script-stage1.md`): run by hand from
this machine, not from CI.

**The sync script no longer decides block markup's byte shape.** `lib/blocks.mjs` and
`lib/convert.mjs` only build the node tree — delimiters, `core/` namespace stripping, `attrs`
JSON encoding, the `"\n\n"` sibling glue, and `wp_kses_post()` are all applied server-side by the
`skt/v1/serialize-blocks` endpoint. This means **`starter-kit.loc` must be running for every run,
including `--dry-run`** — markup generation itself is now a live network call, not just the
live-content diff. See
`../.claude/plans/architect-plan-migrate-blocks-to-serialize-endpoint.md` for the full migration
plan.

## Target: `/wp/v2/doc-page`, not `/wp/v2/pages`

`starter-kit.loc` already publishes these docs (17 of 18 today) as a custom post type, `doc-page`
(hierarchical, REST base `/wp/v2/doc-page`, rewrite slug `docs` baked into the post type's own
registration — confirmed via `wp eval 'print_r(get_post_type_object("doc-page"));'`). Publishing
to `/wp/v2/pages` instead would create a second, colliding set of posts at the same
`/docs/<slug>/` URLs. There is **no synthetic "docs" parent page/post** — `doc-page`'s rewrite
slug already provides the `/docs/` URL prefix. See `lib/wp.mjs`'s header comment for the full
detail, including one open note: two of the 17 live `doc-page` posts
(`advanced-installation-options`, `platform-notes`) have a non-zero `post_parent` (pointing at
`installation`), which this flat, single-level `index.md` manifest has no way to express — this
script never sends a `parent` field, so it neither reproduces nor disturbs that existing
hierarchy.

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
   export WP_BASE_URL=http://starter-kit.loc
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

# --strict: treat converter warnings (e.g. an ordered list split by a nested code block —
# see Decision 4 in the Stage 1 plan) as fatal. Checked before any network call, including the
# serialize-blocks call — a --strict abort issues zero requests.
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
Covers the manifest parser, inline renderer/link rewriter, and every block emitter. `paragraph`,
`listSection`/`listItem`, and `quote` are checked byte-for-byte against real live markup in
`fixtures/live-reference/*.html` (dumped verbatim from the 17 already-published `doc-page`
posts); `heading` remains checked against the synthetic `fixtures/golden-blocks.html` capture
(still correct); `code`, `table`, and `separator` are checked against the live fixtures too
(their shape needed small corrections — see `lib/blocks.mjs`'s header comment for detail).

## What `docs-sync-map.json` is, and why it's committed

A path → WordPress `doc-page` post ID map (`{"usage.md": {"id": 50, "slug": "usage"}}`), used
instead of custom post meta (Decision 1 in the Stage 1 plan): it needs zero server-side PHP
changes in `starter-kit-foundation.loc`, at the cost of being a cache rather than the sole source
of truth — before creating a post, the script probes `GET /wp/v2/doc-page?slug=<slug>` and adopts
a match instead of creating a duplicate, so a lost/corrupt map self-heals (slower, one extra
request per page, but correct). It ships pre-seeded with the 17 real `doc-page` IDs (fetched via
`wp post list --post_type=doc-page --fields=ID,post_name`); `ai-assisted-development.md` is
deliberately absent — it has no live post yet, so the first run creates it rather than adopting
an existing one.

It is committed so:
- Every operator's run starts from the same known page-ID state (no local-only drift).
- `git diff scripts/docs-sync-map.json` is a review signal: new pages appearing, or none, tells
  you whether a run actually created anything.
- Entries are **never deleted**, even when a file is removed from `index.md` — the entry is what
  lets the draft-on-removal pass (below) find that page on every subsequent run.

**Revisit trigger (Stage 3, not built yet):** once this pipeline runs from a hosted GitHub
Actions runner, it can no longer commit an updated map back to git after creating pages. At that
point either the map is fully populated and effectively frozen (new doc files are rare), or the
custom-post-meta approach (`register_meta` + a `rest_page_query` filter in
`starter-kit-foundation.loc`) gets built then, as its own scoped, reviewed change.

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
