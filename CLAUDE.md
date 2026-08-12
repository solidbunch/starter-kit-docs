# Starter Kit Documentation

Source-of-truth Markdown docs for the WordPress Starter Kit (`starter-kit-foundation`,
`starter-kit-theme`). Flat repo, no code — just `.md` files at root, currently manually
copy-pasted into WordPress pages at `starter-kit.loc/docs/`.

## Structure

- [index.md](index.md) — table of contents; **also the manifest** for page order/titles when
  generating anything from this repo (site nav, sync scripts, etc.) — don't duplicate that
  ordering via front-matter in individual files.
- All other `*.md` files at root — one file per doc page, referenced from `index.md`.
- `_config.yml` — Jekyll config (theme: minima, kramdown), for optional GitHub Pages rendering.
- `scripts/` — the one deliberate exception to "flat repo, no code": the Markdown → WordPress
  sync script (see `scripts/README.md` and
  `.claude/plans/architect-plan-docs-sync-script-stage1.md`). Has its own `package.json` and
  `node_modules/` (gitignored). Not a doc page — never add it to `index.md`'s TOC.

## Where plans/decisions live

Non-trivial decisions or plans (e.g. how to automate publishing to the WP site) go in
`.claude/plans/architect-plan-<topic>.md` — same convention as `starter-kit-foundation.loc`,
including being gitignored (machine-local, not committed). One file per plan, dated at the top.
If a plan is later superseded, add a note at the top of the old file pointing to the new one
rather than deleting it.

## Conventions

- All content in English.
- Keep `index.md`'s TOC in sync whenever a file is added, renamed, or removed.
- No code changes happen here — if a task involves scripts/CI to sync this content elsewhere,
  those live in this repo too (e.g. `.github/workflows/`), but the docs content itself stays
  plain Markdown, no front-matter, no build step required to read it.
- No HTML is ever committed to this repo (`*.html` is gitignored) — generated Gutenberg markup
  lives only in the gitignored `scripts/.sync-output/` or on the WordPress site itself.
