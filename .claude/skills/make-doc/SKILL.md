---
name: make-doc
description: Audits and rewrites this repo's Markdown docs to match the real, current code in starter-kit-foundation — reading the actual Makefile, shell scripts, compose files, kit-modules, theme, and CI workflows to verify every command, flag, path, and default before editing. Adds documentation for new code behavior, deletes stale claims, strips addon-plugin/demo-site content, and replaces live hostnames with placeholders. Use whenever the user wants docs updated to reflect the current codebase, verified for accuracy against code, audited for drift, or synced with the foundation repo. Trigger on phrases like "update the docs from code", "check docs against code", "audit docs for drift", "sync docs with the foundation repo", "make-doc", or similar — even if the user just says the docs feel out of date or asks to double-check a doc page against the code.
---

# make-doc — reconcile docs with the code that actually ships

You are acting as a professional technical writer whose only source of truth is code. Every
factual claim in this repo's docs — a command, a flag, a file path, a default value, a Makefile
target, a config key — must be traceable to a line of code in the foundation checkout. If you
can't point to the line, don't write the claim.

This is **not** a rewrite pass. Leave correct, well-written prose alone. Touch only what drifted:
add what's new, delete what's gone, fix what's wrong. Preserve this repo's existing voice and
formatting conventions (see "House style" below) — don't import a different documentation
philosophy wholesale.

## Scope

**Arguments:** $ARGUMENTS

- No argument → full sweep: every file listed in `index.md` gets verified.
- An argument → scoped run. The argument is free-form natural language, not a required filename —
  "update the CI/CD doc", "обнови доку по CI/CD", "check the makefile reference", "makefile-
  reference.md", "kit-modules docs" should all resolve the same way. Match it by meaning against
  `index.md`'s entries (topic and filename) and the "Area" column in the table below — a topic
  word like "CI/CD" or "makefile" is enough, it doesn't need to name the file exactly or use
  English. Restrict the Inventory and Verify steps to whatever it resolves to (one file, several,
  or a whole area). Still read the actual code for them with the same rigor as a full run — a
  scoped run is narrower, not shallower.
- If the argument is genuinely ambiguous or doesn't match anything in `index.md`, say what you
  understood and ask which file/area was meant, rather than guessing silently or falling back to a
  full sweep.

## Ground truth: what to read

Ask the user for the local path to the `starter-kit-foundation` checkout if it isn't already
known from context (e.g. an adjacent working directory). Within it:

| Area                                                                  | Path                                                                                                                                          | Docs it feeds                                                                                                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root repo — Makefile, shell scripts, compose files, env templates     | `Makefile`, `sh/**`, `docker-compose*.yml`, `config/environment/**`                                                                           | installation.md, makefile-reference.md, environment-and-secrets.md, docker-images.md, https-and-local-certificates.md, database-management.md, automatic-backups.md, sending-emails.md |
| kit-modules (independent modules, each invoked via a Makefile target) | `kit-modules/basis`, `kit-modules/monitoring-client`, `kit-modules/monitoring-server`, `kit-modules/proxy`                                    | infrastructure.md, makefile-reference.md                                                                                                                                               |
| Theme                                                                 | `web/wp-content/themes/starter-kit-theme` (may be a bundled dir or its own repo — check `.gitignore`/`composer.json` per `bootstrap-project`) | project-architecture-and-structure.md, ai-assisted-development.md, composer-usage.md                                                                                                   |
| CI/CD                                                                 | `.github/workflows/**`, `.gitlab-ci.yml`, `.gitlab/**`                                                                                        | ci-cd-deployments.md                                                                                                                                                                   |
| Root docs                                                             | `CLAUDE.md`, `README.MD`                                                                                                                      | overview.md, quick-start-after-purchase.md                                                                                                                                             |

Re-derive facts from these files every run — never trust a prior doc-drift pass's summary, and
never trust this repo's own docs as a source about themselves.

### Out of scope — never document

- `web/wp-content/plugins/starter-kit-addon` and anything it provides: `IS_DEMO`/demo mode,
  Stripe integration, demo content seeding, the `docs-publisher` role, the `skt/v1` REST
  namespace, or any other addon-only feature. This plugin exists to run the *demo/sales* site and
  publish these docs to it — it ships to end users only as an optional extra, and describing it
  here would document a plugin most installs won't have. If code you're citing lives under that
  plugin's directory, the fact does not belong in this repo. (Established precedent:
  `.claude/plans/architect-plan-fix-docs-inaccuracies.md` — addon/demo specifics were moved out of
  `ci-cd-deployments.md` into the addon's own README at the user's explicit direction.)
- `scripts/` in this repo (the docs→WordPress publisher) — it's tooling for this repo, not part of
  the foundation a user installs. Never add it to `index.md`.
- Anything that only exists to support the demo/marketing site (demo hostnames, sales copy,
  license-purchase flow details beyond what `quick-start-after-purchase.md` already covers).

## Process

1. **Inventory.** Read `index.md` — it's the manifest of every doc page and the file→topic map.
   For each entry, note which ground-truth area (table above) it depends on.
2. **Verify per file — mandatory, do not skip.** You may not edit a doc file based on memory of
   the code, a prior run's summary, or general knowledge of how the starter kit "usually" works.
   For each doc file, before touching it:
   - Extract every concrete claim it makes: each command, flag, default value, file/dir path,
     table row, numbered step, env var name.
   - Actually open and read the code that claim depends on, using Read/Grep/Bash (`grep -n`,
     `find`) against the real foundation checkout path — not this docs repo. Minimum per area:
     - **Makefile-derived claims:** `grep -n '^[a-zA-Z0-9_.-]*:' Makefile` for the full target
       list, then `Read` each target's recipe body for the actual commands/flags it runs.
     - **Shell scripts:** `Read` the specific `sh/**/*.sh` file a doc step describes; don't infer
       behavior from the script's filename.
     - **Compose/env files:** `Read` `docker-compose*.yml` and `config/environment/**` for
       service names, ports, and variable names/defaults as they exist now.
     - **kit-modules:** `Read` each module's own README/entry script under `kit-modules/<name>`
       for what it actually does when the corresponding Makefile target runs it.
     - **Theme:** `Read` `composer.json`/`package.json` scripts and any doc-referenced file under
       `web/wp-content/themes/starter-kit-theme`.
     - **CI/CD:** `Read` the actual workflow YAML in `.github/workflows/**` /
       `.gitlab-ci.yml` — don't describe a step you haven't read this run.
   - Record a `path:line` citation for every fact you keep, change, or add. If you cannot find a
     citation for something the doc currently claims, that's a signal it's stale — verify by
     searching (`grep -r`) before deleting, don't assume absence from one file means it's gone.
   - This is naturally parallel: for a full sweep, fire one `Explore` or `general-purpose` agent
     per doc file (or per ground-truth area) with instructions to actually read the code above and
     return "doc claim vs. code reality" diffs with citations — not summaries. You make the final
     call on what to change; don't accept an agent's claim without its citation.
3. **Reconcile.**
   - **Stale:** code no longer does what the doc says (removed target, renamed flag, changed
     default) → fix or delete the claim.
   - **Missing:** code now does something with no doc coverage (new Makefile target, new script,
     new required env var) that an end user setting up or running the foundation would need → add
     a concise entry in the right existing file/section. Only create a new file if nothing in
     `index.md` is a reasonable home — that's a bigger call, flag it to the user instead of
     deciding alone.
   - **Out of scope:** doc content matches the exclusion list above → remove it entirely, don't
     just soften it.
4. **Placeholders.** Any live/demo hostname or URL (e.g. `starter-kit.io` and its subdomains) gets
   replaced with the existing per-project placeholder convention: `<your-domain>`,
   `<dev-host-alias>`, `<prod-host-alias>`, `<dev server IP or hostname>`, etc. (see
   `ci-cd-deployments.md` for the established pattern). Exception: `licensing.starter-kit.io` is a
   permanent shared SolidBunch service, not a per-project value — leave it as-is. When introducing
   a new placeholder, angle-bracket it and make what it stands for obvious from context.
5. **index.md sync.** If you added, removed, or renamed a file, update `index.md`'s TOC (order +
   link) to match, and make sure the TOC link text mirrors the file's own first `# Heading` —
   the heading is the source of truth for title, per this repo's `CLAUDE.md`.
6. **Self-check before finishing:**
   - Every changed claim has a `path:line` citation you could show if asked.
   - No `is_demo`, `IS_DEMO`, `starter-kit-addon`, Stripe, or other excluded terms remain anywhere
     in the `.md` files (`grep -ril` across the repo root as a final pass).
   - No live demo hostname remains outside the `licensing.starter-kit.io` exception.
   - `index.md` TOC still mirrors every file's H1.
7. **Coherence pass — after every edit in this run has landed.** Steps 2–6 verify each file
   against the code and against this skill's own rules; this step verifies the edited files
   against *each other*. Re-read only the files you touched this run — this is mechanical, not a
   second round of code verification, so don't spin up another per-file agent fleet for it, one
   pass over the touched-file set is enough even on a full sweep:
   - **Markdown syntax.** Every fenced code block opens and closes, every table row has the same
     column count as its header separator, every `[text](target)` link and `![...]` image is
     well-formed, no section was left truncated by an edit.
   - **Internal links resolve.** For every relative link to another file in this repo
     (`other-file.md` or `other-file.md#anchor`), confirm `other-file.md` exists and, if there's an
     `#anchor`, that some heading in that file slugifies to it (GitHub's rule: lowercase, strip
     punctuation except `-`, spaces → `-`). The usual way this breaks: a link added in step 3
     points at a heading that got renamed or removed in the same run.
   - **Cross-file consistency.** This repo's "one fact stated once" house style means duplication
     should be rare, but real exceptions exist (e.g. `APP_MULTI_INSTANCE` is described in both
     `ci-cd-deployments.md` and `infrastructure.md`). If step 3 changed a fact that's also stated
     elsewhere, check the other copy still agrees — don't leave one updated and the other stale.
   Fix anything caught here before reporting; note in the final report if this pass changed
   anything beyond what step 3 already accounted for.

## House style (already established in this repo — follow it, don't replace it)

- Written for someone installing and running their **own** project from this starter kit — not
  for SolidBunch's demo/sales site, not for contributors to the kit itself.
- Terse and task-oriented: numbered steps for procedures, tables for reference data (flags, env
  vars, targets), fenced code blocks for every command and file example, no prose paragraphs where
  a list or table says it faster.
- Imperative mood for instructions ("Clone the repository", not "You will clone the repository").
- The emoji-prefixed blockquote callouts already used throughout (`> ⚡️`, `> 💡`, `> 🔐`, `> ♻️`,
  `> 🖥️`, `> 📁`, etc.) are this repo's convention for tips/warnings/notes — reuse them, don't
  invent a new callout style, and don't add emoji anywhere else.
- No marketing language, no filler ("simply", "just", "easily", "powerful"), no restating what a
  linked external doc (Docker, Git, Make) already explains — link out instead.
- One fact stated once. If two files would need the same explanation, link to the file that owns
  it rather than duplicating.
- Plain Markdown only — no HTML (this repo gitignores `*.html`), no front-matter in doc files
  (ordering/metadata lives in `index.md` only, per `CLAUDE.md`).
- All content in English.

## When you're done

List every changed file with its full path (per the user's standing preference). For each,
one line on what changed and why (e.g. "installation.md: removed step 8, `make certbot` no longer
exists — `Makefile` has no such target as of <date checked>"). If you skipped something you
noticed but weren't sure was in scope (e.g. a new file might be warranted, a section might need
deeper restructuring), report it — don't silently expand scope or silently drop it.
