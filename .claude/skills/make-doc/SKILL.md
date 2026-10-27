---
name: make-doc
description: Audits and rewrites this repo's Markdown docs to match the real, current code in starter-kit-foundation — reading the actual Makefile, shell scripts, compose files, kit-modules, theme, and CI workflows to verify every command, flag, path, and default before editing. Adds documentation for new code behavior, deletes stale claims, strips addon-plugin/demo-site content, and replaces live hostnames with placeholders. Verifies per document (every claim of every selected doc, never just the git diff), runs the documented commands, and ends with a cold read of the final text. Use whenever the user wants docs updated to reflect the current codebase, verified for accuracy against code, audited for drift, or synced with the foundation repo. Trigger on phrases like "update the docs from code", "check docs against code", "audit docs for drift", "sync docs with the foundation repo", "make-doc", or similar — even if the user just says the docs feel out of date or asks to double-check a doc page against the code.
---

# make-doc — reconcile docs with the code that actually ships

You are acting as a professional technical writer whose only source of truth is code. Every
factual claim in this repo's docs — a command, a flag, a file path, a default value, a Makefile
target, a config key — must be traceable to a line of code in the foundation checkout. If you
can't point to the line, don't write the claim.

This is **not** a rewrite pass. Leave correct, well-written prose alone. Touch only what drifted:
add what's new, delete what's gone, fix what's wrong — but find out what drifted by verifying
every claim of each selected doc against the code, never by looking at what changed recently. Preserve this repo's existing voice and
formatting conventions (see "House style" below) — don't import a different documentation
philosophy wholesale.

## Scope

**Arguments:** $ARGUMENTS

- If the argument text above is empty or still shows its placeholder (the harness did not
  substitute it) but the user wrote a request in chat, the chat request IS the argument.
- No argument and no request text at all → full sweep: every file listed in `index.md` gets verified.
- An argument → scoped run. The argument is free-form natural language, not a required filename —
  "update the CI/CD doc", "обнови доку по CI/CD", "check the makefile reference", "makefile-
  reference.md", "kit-modules docs" should all resolve the same way. Match it by meaning against
  `index.md`'s entries (topic and filename) and the "Area" column in the table below — a topic
  word like "CI/CD" or "makefile" is enough, it doesn't need to name the file exactly or use
  English. Restrict the Process steps 1-4 (inventory, verify, run, reconcile) to whatever it resolves to (one
  file, several, or a whole area). Still read the actual code for them with the same rigor as a full run — a
  scoped run is narrower, not shallower.
- A request phrased around changes ("update docs from the latest commits", "the Makefile
  changed, update the docs") is a **scoped run whose areas are picked from the verification markers and the
  foundation log** (Process, "Picking areas from a change-phrased request"). The markers and the
  log only decide which areas to start with; every doc of a picked area is still verified claim by claim in full. The run then
  stops and reports what it did not examine. It never silently becomes a full sweep and never
  silently skips areas.
- If the argument is genuinely ambiguous or doesn't match anything in `index.md`, say what you
  understood and ask which file/area was meant, rather than guessing silently or falling back to a
  full sweep.

## Ground truth: what to read

The foundation checkout directory may be named `starter-kit-foundation` or
`starter-kit-foundation.loc`. Do not guess: the checker finds it (Process, "Setup", item c) and
prints the real path in its success line; ask the user for the path only if the checker reports
"not found".
Within it:

| Area                                                                  | Path                                                                                                                                          | Docs it feeds                                                                                                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root repo — Makefile, shell scripts, compose files, Dockerfiles, env templates     | `Makefile`, `sh/**`, `docker-compose*.yml`, `dockerfiles/**`, `config/environment/**`                                                                           | installation.md, makefile-reference.md, environment-and-secrets.md, docker-images.md, https-and-local-certificates.md, database-management.md, automatic-backups.md, sending-emails.md |
| kit-modules (independent modules, each invoked via a Makefile target) | `kit-modules/basis`, `kit-modules/monitoring-client`, `kit-modules/monitoring-server`, `kit-modules/proxy`                                    | infrastructure.md, makefile-reference.md                                                                                                                                               |
| Theme                                                                 | `web/wp-content/themes/starter-kit-theme` (may be a bundled dir or its own repo — check `.gitignore`/`composer.json` per the foundation's own `bootstrap-project` skill, `.claude/skills/bootstrap-project/` in the foundation checkout) | project-architecture-and-structure.md, ai-assisted-development.md, composer-usage.md                                                                                                   |
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

The unit of work is **one document**, verified in full. The unit of delivery is **one area** (a
row of the Ground-truth table): all its docs, reviewed together. Steps 7-9 below run **per area,
on that area's final text, before the area is delivered** — not once per run.

### Setup (once per run, in this order)

a. **Docs repo root.** Run `git rev-parse --show-toplevel` first. All relative paths in this skill
   are relative to that root. The shell's working directory resets between Bash calls, so every
   Bash call uses absolute paths or `(cd <root>/scripts && ...)`. This skill writes script
   commands as `(cd scripts && ...)`, meaning "from the docs repo root".
b. **Node.** The scripts need `node` and `scripts/node_modules`. If `scripts/node_modules` is
   missing, run `(cd <root>/scripts && npm ci)` once (see `scripts/README.md`, Prerequisites); if
   that fails, report it.
c. **Foundation checkout.** Run `(cd <root>/scripts && node check-doc-claims.mjs)` once; any claim
   failures are irrelevant at this point. Its last line prints
   `... verified against <path> [env|sibling|main-checkout-sibling]`: that `<path>` is the
   foundation; use it for every Read/Grep. When claims fail, there is no such line: the first
   line reads `check-doc-claims: N unverified claim(s) found (foundation: <path>)` and the
   last line is `Fix: ...`; take `<path>` from that first line. The checker looks for `FOUNDATION_PATH`, then
   `../starter-kit-foundation.loc` next to the docs repo, then the same sibling next to the main
   checkout. `starter-kit-foundation` and `starter-kit-foundation.loc` are only example directory
   names; any name other than `../starter-kit-foundation.loc` needs `FOUNDATION_PATH`. If the
   checker prints `WARNING foundation checkout not found` instead, ask the user for the path and
   put `FOUNDATION_PATH=<path>` in front of every later `check-doc-claims` call.
d. **Baseline.** Run `(cd <root>/scripts && node check-title-drift.mjs)` BEFORE editing anything
   and keep its output. After editing, any converter warning that is not in this baseline is new
   and must be removed.
e. Then pick the areas (below).

### Picking areas from a change-phrased request

A commit date is not proof that docs were verified: one docs commit that touches one page says
nothing about the other pages, and this repo's docs fell behind the code exactly that way. The
anchor is therefore an explicit marker file, `scripts/doc-audit-verified.txt`, that records for
each area the foundation commit its docs were last **fully verified** against (format: the
file's header comment). The area keys are `root-repo`, `kit-modules`, `theme`, `ci-cd` and
`root-docs`, one per row of the Ground-truth table, top to bottom.

For a request like "update docs from the latest commits" (a scoped run, see "Scope"):

1. Read `scripts/doc-audit-verified.txt`.
2. Read the foundation head with `git --no-optional-locks -C <foundation path> rev-parse HEAD`
   and keep it as the area's verification sha. Also run
   `git --no-optional-locks -C <foundation path> status --porcelain`: uncommitted
   foundation changes are not covered by the log; report them as "uncommitted foundation
   changes".
3. For each area:
   - **No marker line** → the area was never audited.
   - **Marker sha not in the foundation history** (`git --no-optional-locks -C <foundation path>
     cat-file -e <sha>^{commit}` fails, e.g. history was rewritten) → treat it as never audited.
   - **Otherwise** list what changed since the marker:
     `git --no-optional-locks -C <foundation path> log <sha>..HEAD --name-only --format='%h %s'`.
     The area is due if
     a changed file maps to it through the Ground-truth table paths. Changed files that map to
     no area row (the addon plugin, `.claude/`, anything else) are ignored for selection but
     listed in the report as "unmapped changes".
4. Process every area that is due because of changes, each as described below: every doc of the
   area verified claim by claim, never from the diff.
5. Never-audited areas are expensive. Do not start them silently: list them and ask the user
   which one to start with (an "ask the user" point).
6. If no area is due and none is never-audited, report "all areas verified up to <sha>; nothing
   to do" and stop. That is the only case in which an empty result means "nothing to do".
7. Then **stop** and report which areas were not examined, and offer to continue with them. Do not
   silently skip them and do not silently run a full sweep.

Every git call on the foundation checkout uses `git --no-optional-locks`: a plain
`status` call can refresh and write the foundation's `.git/index`, and the foundation is read-only ground truth.

After an area is delivered, its marker line is updated (step 10).

Using the markers and the log to pick areas does not conflict with the rule below that claims are
never derived from `git diff`/`git log`: they pick the order of areas, they never define what is
verified. Steps 5-6 (placeholders, index sync) apply in a scoped run too.

### 1. Inventory per document, never per diff

1. Read `index.md` (the manifest of every doc page) and pick the docs in scope (see "Scope"). Map
   each doc to the area(s) whose "Docs it feeds" cell names it. A doc listed in several areas is
   verified in full, **once**, against **all** the code areas that list it, in the first area you
   process, and delivered with that area; do not re-verify it in later areas. A doc listed in
   `index.md` but named in no area row is verified against the area its commands and paths point
   to and processed with that area; if none fits, report it instead of guessing.
2. Every doc in scope is verified in full, whether or not its foundation code changed. Never
   derive claims from `git diff`/`git log`.
3. For each doc, the claim list lives at `.claude/doc-audit/<doc-slug>.claims.md`, where
   `<doc-slug>` is the file name without `.md`. Item 4 below generates it. The
   directory is covered by the repo's `.claude/*` gitignore rule, so it is machine-local and never
   committed. An existing claim list from an earlier run is overwritten, never reused as truth.
   One row per checkable fact: a command, path, flag, value/default, numbered-step order or named
   variable; a sentence containing none of these is not a claim. The columns, always in this
   order:

   ```
   | doc:line | claim | checker | ground truth path:line | audit status | notes |
   |---|---|---|---|---|---|
   ```

   - `checker`: generated by the tool (values below); empty for claims you add by hand.
   - `audit status`: `verified`, `changed`, `removed`, `added`, `unexecuted` or `external`. Leave
     empty until you have read the code; no row may be empty when the area is done.
   - `ground truth`: the `path:line` that proves the claim. For a `removed` claim, the `path:line`
     that shows the absence (e.g. the Makefile target list) or `absent: <grep command used>`.
   - `notes`: why a cold-read guess is "not a gap", why a command is `unexecuted`, what an
     `external` claim depends on.
   - `external` = the claim depends on a system outside the foundation code (Docker, Terraform,
     the GitHub/GitLab UI, third-party defaults). Give it a note and list it in the report.
4. Generate the list with the checker. `<doc>.md` is the file name including `.md`, e.g.
   `installation.md`:

   ```bash
   (cd scripts && DOC_CLAIMS_REQUIRE_FOUNDATION=1 node check-doc-claims.mjs --write-audit-list=<doc>.md)
   ```

   The command writes `.claude/doc-audit/<doc-slug>.claims.md` (creating the directory) and
   overwrites any earlier file. It still writes the file when the run exits 1 because of failed
   claims, so read the file even then. Its stdout line `wrote <path> (<n> claims)` names the file.
   The file has the table above, one row per claim the checker found: `claim` is `<kind>: <value>`
   and `ground truth`, `audit status` and `notes` are empty. Add every claim you find by hand as a
   new row with an empty `checker` cell. `<kind>` is `make`, `make-args` (the argument-count rule
   for `make exec|run`), `path`, `relpath`, `var`, `workflow` or `make-ref` (Makefile target
   missing from `makefile-reference.md`). The `checker` cell holds one of:
   - `ok`: exists in the foundation (this proves existence only, not behaviour).
   - `fail`: does not match the foundation.
   - `skipped`: not checkable here (a kit-module not installed, or the `make exec|run` limit
     check disabled).
   - `runtime`: created at runtime by design, so absent from the checkout.
   - `allowed`: matches an `[allowed]` allowlist entry (legitimate non-match).
   - `known-drift`: matches a `[known-drift]` entry (real drift, reported).
   - `unverified`: no foundation checkout was available.

   Mapping to the audit status: `ok` → verify the behaviour in the code, then `verified`.
   `skipped` (kit-module not installed) → `external`, note "module not installed". `runtime` →
   `verified`, citing the script that creates the path at runtime. `known-drift` → report it, and
   fix it only if the drifting doc is in scope. `fail` → fix the doc; a `fail` that is a checker
   false positive is reported per the allowlist rule in step 8 and the area is not delivered.
5. Then add the claims the checker cannot see: default values, flag meanings, step order and
   numbering, argument handling of every documented command, prose paths without backticks, paths
   inside fenced blocks, relative paths with no known prefix (`web/wp-core/`), and anything the
   doc says does or does not happen.

### 2. Verify every claim against the code — mandatory, do not skip

You may not edit a doc based on memory of the code, a prior run's summary, or general knowledge of
how the starter kit "usually" works. For each claim in the list:

- Open and read the code it depends on, using Read/Grep/Bash (`grep -n`, `find`) against the real
  foundation checkout path — not this docs repo. Minimum per area:
  - **Makefile-derived claims:** `grep -n '^[a-zA-Z0-9_.-]*:' Makefile` for the full target list,
    then `Read` each target's recipe body for the actual commands/flags it runs.
  - **Shell scripts:** `Read` the specific `sh/**/*.sh` file a doc step describes; don't infer
    behavior from the script's filename.
  - **Dockerfiles:** `Read` the `dockerfiles/<service>/` Dockerfile and entrypoint scripts a doc
    describes (base images, entrypoints, guards), not just the compose file that uses them.
  - **Compose/env files:** `Read` `docker-compose*.yml` and `config/environment/**` for service
    names, ports, and variable names/defaults as they exist now.
  - **kit-modules:** `Read` each module's own README/entry script under `kit-modules/<name>` for
    what it actually does when the corresponding Makefile target runs it.
  - **Theme:** `Read` `composer.json`/`package.json` scripts and any doc-referenced file under
    `web/wp-content/themes/starter-kit-theme`.
  - **CI/CD:** `Read` the actual workflow YAML in `.github/workflows/**` / `.gitlab-ci.yml` —
    don't describe a step you haven't read this run.
- Record a `path:line` citation for every fact you keep, change, or add. If you cannot find a
  citation for something the doc currently claims, that's a signal it's stale — verify by
  searching (`grep -r`) before deleting, don't assume absence from one file means it's gone.
- For every documented command, read the target script's **argument parsing**. Example: `make
  exec` runs `sh/dev/run.sh`, which reads only its first three arguments (mode, service, user), so
  extra words are silently dropped. The checker flags only this `make exec|run` case (kind `make-args`); every
  other target is on you.
- Check the claim against the [Known pitfalls](#known-pitfalls) list: it names six mistakes that a
  real audit made, with the code lines to read for each.
- Parallelism is allowed. `Explore` agents only locate code, so use `general-purpose` agents for
  claim-vs-code verification: one per doc (or per area), told to read the code and return "doc
  claim vs. code reality" rows with `path:line` citations, not summaries. You make the final call.
  Spot-check their citations yourself: open at least one citation per claim kind per doc, and
  every citation behind a change you make. Do not accept a claim without a citation.

### 3. Run the documented commands

- **Read-only** means the command writes no files, starts/stops/removes no containers, touches
  no network accounts (cloud, registry, CI, mail) and cannot print secrets. Examples: print
  help/version/status, read non-secret files, `git --no-optional-locks status`. Read-only commands
  get run, but never inside the user's foundation checkout (the one exception is the lock-free
  `git --no-optional-locks -C <foundation path>` reads in "Picking areas"); compare
  the real output or effect with what the doc says. `docker compose config` can print secrets
  (outside a scratch project), and `make -n` is not guaranteed safe (parse-time `$(shell)`): treat
  any `make <target>` as risky unless you read its recipe and it only prints. **When unsure, treat
  the command as risky.**
- **Risky commands** (database upgrade, rollback, collation conversion, password reset, bootstrap,
  provisioning, `make import` / `migrate`, anything that creates, deletes or overwrites data,
  containers or files) run only if they are not on the hard denylist below and only in one of the
  environments below; otherwise they are `unexecuted`. The environments:
  - the **scratch project** ("Providing a scratch project" below): a file-only copy of the
    foundation, where only the listed commands are allowed;
  - a **synthetic recipe**, for the main agent only: a test with its own unique name prefix, never
    the foundation's compose files, no published ports and only local images. The recipes in
    "Verified test recipes" are the one exception to the denylist's ban on `restart`, `recreate` and
    `down`: they run raw `docker compose` commands, but only in their own isolated project.
    A recipe whose image is not available locally aborts; the command is then `unexecuted`.
- **Default: mark the command `unexecuted`.** If no environment above can run it, or Docker is
  unavailable, or you are unsure, do not run it: set audit status `unexecuted` with the reason in
  `notes` (for a denylisted command: "denylisted: <why>") and list it in the final report. The
  foundation's own compose-stack procedures (install, up, restart, recreate, down, secret, localci,
  toolkit services, db-tunnel, prune) are `unexecuted` by default: check their behaviour by reading
  the code. Never run risky commands in the user's working install, against real cloud, registry or
  CI accounts, or with real credentials.
- Behaviour that needs Docker (an image guard, compose `restart` against recreate) is tested with
  the scripts in [Verified test recipes](#verified-test-recipes), never in the foundation's own
  stack.
- These rules bind the cold-read agent (step 9) exactly as they bind you.

#### Hard denylist

These commands are never run by anyone, the main agent and the cold-read agent alike, even inside a
scratch project or any other throwaway environment. Paths are in the foundation checkout:

- `make docker clean` or `make docker prune`, and any `docker ... prune` command: they act on the
  whole Docker daemon, not on one project (`sh/system/docker.sh:145-151`).
- `make db-tunnel`: it publishes `127.0.0.1:<port>` on the host (`sh/system/db-tunnel.sh:62-66`).
- `make mailhog`: it uses the fixed container name `mailhog` and `--service-ports`
  (`Makefile:160-161`).
- `make pma`: it uses `--service-ports` (`Makefile:158`).
- `make watch`: it uses `--service-ports` (`sh/dev/npm-watch.sh:12`).
- `make install`, `make secret`, `make up`, `make upd`, `make recreate`, `make restart` and
  `make down`.
- `make localci`: it publishes port 4566 (`docker-compose.localci.yml:17`).
- Anything that starts the project's compose stack, publishes a host port, uses a fixed container
  name, or acts on a global Docker namespace.

Why: the cron service mounts `/var/run/docker.sock` and the host path
`${WORKING_DIR:-$DEFAULT_PATH}` (`docker-compose.yml:161-167`, with `DEFAULT_PATH=/srv` at
`config/environment/.env.main:75`), and `sh/env/secret-gen.sh:30-32,78-80` runs
`docker rm -f pass-gen-container`, a fixed name that can belong to someone else. The agents share
the Docker daemon with the user's own running stacks.

#### Providing a scratch project

A scratch project is a file-only copy of the foundation. No container is ever started in it.

- **Allowed there**, from the copy root: `make env [<type>]` (it runs only `sh/utils/logo.sh` and
  `sh/env/init.sh` and writes `.env` and `.env.runtime` inside the copy), `bash sh/env/init.sh
  [<type>]`, `docker compose config` and `docker compose config --services` (the secrets in the
  copy are template dummies), read-only `git` commands, and reading generated files. Nothing else.
- **Cannot do:** `make install` and composer/npm (no network guarantee, no theme in the copy,
  `sh/system/install.sh`); anything under `kit-modules/` (not tracked, so absent); a running stack
  (denylist); CI workflows (the files exist but are not runnable here); cloud, registry or SSH
  access.
- The copy contains committed files only: no `kit-modules/`, no theme or `web/wp-content`, no
  `web/wp-core`, no `db-data`, and no real `.env.secret`. The script copies a dummy `.env.secret`
  from the tracked `sh/env/.env.secret.template`. Uncommitted foundation changes are not in the
  copy; the script prints them.
- `git clone --no-hardlinks` copies the files without linking into the foundation, and
  `git remote remove origin` stops a push from the copy from reaching the user's checkout.

Run `recipes/scratch-project.sh` once with `bash`, with `FOUNDATION` set to the foundation path and
`SCRATCH` to the scratchpad directory. It prints the copy path and its `APP_NAME`; those are the
values for the step 9 slot.

The unique `APP_NAME` makes every container name that `docker compose config` prints start with the
ID. The `TF_VAR_*` lines in `.env.main` interpolate it too.

**Teardown.** After the cold read and any command of your own, run `recipes/scratch-teardown.sh`
with `bash`, with `SCRATCH` set and `COPY` set to the printed path. No container was started, so
there is nothing else to remove.

### 4. Reconcile

- **Stale:** code no longer does what the doc says (removed target, renamed flag, changed
  default) → fix or delete the claim.
- **Missing:** code now does something with no doc coverage (new Makefile target, new script, new
  required env var) that an end user setting up or running the foundation would need → add a
  concise entry in the right existing file/section.
- **New file:** only if nothing in `index.md` is a reasonable home. That is a bigger call: flag it
  to the user and wait. If approved, append the page to `index.md` in a logical position next to
  related pages (step 6).
- **Out of scope:** doc content matches the exclusion list above → remove it entirely, don't just
  soften it.
- Update the claim-list row (`changed`, `removed`, `added`) for every edit.
- House-style fixes apply only to passages you are already touching; report other style problems
  you notice without fixing them.

#### Converter limits — avoid these while writing

The docs are converted to WordPress blocks by `scripts/lib/convert.mjs`, which throws on
unsupported structure, so a violation only shows up at commit time unless you avoid it:

- A blockquote (`>` callout) may contain **only paragraphs**: no list, fenced block, table,
  heading or nested quote inside it.
- A list item may contain only paragraphs, nested lists and fenced blocks: no table, blockquote
  or heading inside it. A fenced block inside a list item splits the list in two and logs a
  converter warning. That warning is not a failure (the repo has a few intentional ones), but do
  not add new ones.
- No indented code blocks and no raw HTML, except `<!-- embed: URL -->`.
- The first heading of a page is its title (`post_title`), not content; `index.md`'s TOC text
  must mirror it.

### 5. Placeholders

Any live/demo hostname or URL on `starter-kit.io` (and its subdomains) gets replaced with the
existing per-project placeholder convention: `<your-domain>`, `<dev-host-alias>`,
`<prod-host-alias>`, `<dev server IP or hostname>`, etc. (see `ci-cd-deployments.md` for the
established pattern). Exceptions: `licensing.starter-kit.io` is a permanent shared SolidBunch
service, not a per-project value — leave it as-is; the bare product/purchase link
`https://starter-kit.io` (no subdomain) stays; `.loc` hostnames (e.g. `starter-kit.loc`) are
local dev names and stay. When introducing a new placeholder, angle-bracket it and make what it
stands for obvious from context.

### 6. index.md sync

If you added, removed, or renamed a file, update `index.md`'s TOC (order + link) to match, and
make sure the TOC link text mirrors the file's own first `# Heading` — the heading is the source
of truth for title, per this repo's `CLAUDE.md`.

### 7. Coherence pass and self-check — per area, after that area's edits have landed

An area with no edits skips steps 7 and 9 but still runs step 8. Steps 1-6 verify each file against the code and against this skill's own rules; this step
verifies the edited files against *each other*. Re-read only the files you touched in this area —
this is mechanical, not a second round of code verification, so don't spin up another agent
fleet for it.

- **Markdown syntax.** Every fenced code block opens and closes, every table row has the same
  column count as its header separator, every `[text](target)` link and `![...]` image is
  well-formed, no section was left truncated by an edit.
- **Internal links resolve.** For every relative link to another file in this repo
  (`other-file.md` or `other-file.md#anchor`), confirm `other-file.md` exists and, if there's an
  `#anchor`, that some heading in that file slugifies to it (GitHub's rule: lowercase, strip
  punctuation except `-`, spaces → `-`). The usual way this breaks: a link added in step 4 points
  at a heading that got renamed or removed in the same run.
- **Cross-file consistency.** This repo's "one fact stated once" house style means duplication
  should be rare, but real exceptions exist (e.g. `APP_MULTI_INSTANCE` is described in both
  `ci-cd-deployments.md` and `infrastructure.md`). If step 4 changed a fact that's also stated
  elsewhere, check the other copy still agrees — don't leave one updated and the other stale.
- **Self-check.**
  - Every changed claim has a `path:line` citation you could show if asked.
  - No excluded term remains in the docs. Build the page list from `index.md` (its link targets, e.g.
    `grep -o '](\([^)#]*\.md\))' index.md | sed 's/^](//; s/)$//' | sort -u`)
    and run, over `index.md` plus those pages (not `scripts/`, `.claude/`, `CLAUDE.md` or
    `README.MD`):
    `grep -il -e is_demo -e starter-kit-addon -e stripe -e docs-publisher -e skt/v1 <pages...>`
    Judge case-insensitive hits such as "striped" by hand.
  - No live `starter-kit.io` host remains: `grep -n 'starter-kit\.io' <pages...>`. Every hit except
    `licensing.starter-kit.io` and the bare purchase link `https://starter-kit.io` must be replaced
    per step 5, including a docs-site URL and any address at that domain.
  - `index.md` TOC still mirrors every file's H1.

Fix anything caught here before continuing; note in the final report if this pass changed
anything beyond what step 4 already accounted for. Any fix is an edit and invalidates earlier
reviews of that doc: redo steps 7 and 8 (and step 9 if it already ran).

### 8. Checks — after every edit and before an area is delivered

Run from the docs repo root, as **two separate commands**, so one failure never hides the other:

```bash
(cd scripts && DOC_CLAIMS_REQUIRE_FOUNDATION=1 node check-doc-claims.mjs)
(cd scripts && node check-title-drift.mjs)
```

- `check-title-drift` checks that `index.md`'s TOC text matches each file's own first `# heading`,
  and runs the converter, so it also catches the converter limits above. Exit 1 on any problem.
  Run it after **every edit**, not only at the end.
- `check-doc-claims` checks the claims of every root doc page against the foundation (strict mode:
  a missing foundation or kit-module is a failure). Exit 1 on unverified claims. Exit 0 with a
  `KNOWN DRIFT` block on stderr for allowlisted real drift: that does not fail the run, but each
  entry must still be fixed or listed in the final report.
- Both checkers always run over **all** docs. If a failure is in a doc **outside** the current
  area, do not fix it silently and do not widen the scope: report it and stop this area before
  delivery, and ask the user whether to fix it, record it as `[known-drift]` (allowlist rule
  below), or widen the scope.
- Never bypass the pre-commit hook (`git commit --no-verify`).
- **Allowlist rule** (`scripts/doc-claims-allowlist.txt`). Never edit the checker. A failure that
  is a suspected false positive in the checker's logic is reported, not worked around. The only
  file you may edit is the allowlist, and only with an entry of one of two kinds:
  (a) `[allowed]` for a legitimate non-match (an external name, a value the user creates), one
  entry per file, with a reason; (b) `[known-drift]` for real drift that cannot be fixed in this
  run, with a reason. In both cases propose the exact entry to the user and write it only after
  their explicit OK, never silently. Read the "Doc claims check" section of `scripts/README.md`
  for the exact format; proposed entries use `<file> <kind> <value>  # <reason>` (one entry per
  claim, per file). Never use an entry to hide drift you could fix. An approved
  allowlist change is part of the same area's change set and is called out in the report.
- Re-run both commands after any edit made in steps 7 or 9.

### 9. Review the FINAL text only — cold read per edited doc

Reviews and cold reads get the finished file on disk, never a diff or a draft. Any edit made
after a review invalidates it and that review runs again, with a maximum of **two cold-read
rounds per doc**.

Once steps 7 and 8 pass on the area's final text, run a **mandatory cold read for every doc
edited in the area** except `index.md`, including reference pages (for those the agent still
returns guesses about terms and values, and the commands lists may be empty). It is the last
review.

1. Fill the scratch-project slot. If the doc has a command that the scratch project's allowlist
   (step 3, "Providing a scratch project") could run, run `recipes/scratch-project.sh` and use its
   output: the value is the copy's path, its `APP_NAME`, and the sentence "allowed there: make env
   [<type>], bash sh/env/init.sh [<type>], docker compose config, read-only git, reading files".
   Otherwise the value is `none prepared`. That is also the value when the doc has no such command
   (reference pages, compose-stack-only procedures, kit-module procedures, CI/cloud procedures), or
   when git or the scratchpad is unavailable. Then every non-read-only command goes into the
   not-run list.
2. Spawn a fresh `general-purpose` subagent with no conversation context. Give it **only** the
   prompt below, verbatim, with the `<...>` slots filled in:

   ```
   You are a newcomer to this project. Read <absolute path of the doc> and follow its procedure step
   by step, in order, as a first-time user would.
   Reading:
   - You may READ any file: the doc, the other docs in <absolute path of the docs repo>, and every file
     in the foundation checkout <absolute path of the user's foundation checkout>.
     Reading that checkout is allowed and expected: when the doc leaves something unstated, read the code it depends on.
   Running commands:
   - Never RUN a command inside <absolute path of the user's foundation checkout>; reading it is fine.
     Never run anything against real cloud, registry or CI accounts (terraform apply/destroy, oidc
     test, docker push/login, deploys), never with real credentials.
   - Never run, anywhere, even in the scratch project:
     make docker clean or prune, any docker prune command, make db-tunnel, make mailhog, make pma,
     make install, make secret, make up, make upd, make recreate, make restart, make down,
     make localci, anything that starts the project's compose stack, anything that publishes a host
     port, anything that uses a fixed container name.
   - Run a command only if it is read-only (reads non-secret files, prints help/version/status,
     `git --no-optional-locks status`; anything that could print a secret is not read-only), or it
     is allowed in this scratch project and you run it there: <scratch project path + APP_NAME +
     allowed commands, or "none prepared">.
   - If the scratch project is "none prepared", write this line once, as the first line of list 3:
     No scratch project was provided.
     Then evaluate every step by reading the doc and the foundation code, and give each command you
     did not run the reason "no scratch project".
   - For every command the doc gives, record: the command, whether you ran it, where, and what happened
     compared with what the doc says should happen. For every command you did NOT run, give the reason.
   Return three lists, nothing else:
   1. Every place you had to guess: missing prerequisite, undefined term, a value used before it is
      introduced, an ambiguous "step N" / "above" reference, a command whose expected output or effect
      is unstated, a step whose real result differed from the doc.
   2. Commands run: command | where | doc's expected result | actual result.
   3. Commands not run: command | reason.
   Do not give a PASS/FAIL verdict or a summary of quality.
   ```

   The agent's three lists are called the "guesses list", the "commands-run list" and the
   "not-run list" below. Use the prompt text above as written; only fill in the slots.

3. Resolve every entry of the guesses list: fix the doc, or record in the claim list `notes` why it is
   not a gap.
4. Copy every command entry of the not-run list into the claim list as `unexecuted` (reason in
   `notes`), unless you then run it yourself in an allowed environment (step 3). The "No scratch
   project was provided." line is not a command and is not copied.
5. If resolving guesses changed the doc, redo steps 7 and 8 for it and cold-read the new final
   text once more (the second and last round). Guesses still open after the second round go in the
   final report, pasted verbatim.
6. If you cannot spawn agents (for example you are yourself a subagent), the cold read cannot be
   done. The area is then NOT ready: report it as "blocked at step 9" and never call it ready to
   commit or done.

### 10. Delivering an area (definition of done)

An area is ready only when every box is true:

- [ ] Every doc of the area has a claim list generated with `--write-audit-list`. Every row has an
      audit status. Every row has a ground-truth `path:line`, except rows with checker `ok` whose
      doc claim is only that the thing exists.
- [ ] Both checkers pass in strict mode (step 8); only `[known-drift]` hits remain, each reported.
- [ ] Risky commands were run in an allowed environment, or they are `unexecuted` (denylisted or
      not isolatable) and listed.
- [ ] A cold read (step 9) ran on the final text of every edited doc; every guess is resolved or
      reported verbatim, and its not-run commands are in the claim list.
- [ ] The coherence pass and self-check (step 7) are done (an area with no edits needs only the
      step 8 checkers).

Then deliver it:

- Do **not** commit unless the user asked for commits (or invoked the project's commit workflow).
  Otherwise leave the area as a reviewed change set, report "ready to commit: <area>, files: ...",
  and continue to the next in-scope area without waiting.
- When committing: one commit per area (the area's docs, `index.md` if it changed, and an approved
  allowlist change), made with the project's `commit` skill (Skill tool `commit`), never `--no-verify`, never
  pushed.
- If an area ends with no changed doc, make no commit and say so in the report.
- **Record the verification.** Set the area's line in `scripts/doc-audit-verified.txt` to
  `<area-key> <foundation sha> <YYYY-MM-DD>`, using the foundation head you read at the start of
  the area (never a later one). Do this only when every box above is true; never for an area that
  is blocked, partly verified or "blocked at step 9". The marker change belongs to the area's
  change set (the same commit when committing) and is listed in the report.

Then start the next in-scope area. The only places where you wait for the user are the "ask the
user" points: an ambiguous argument, which never-audited area to start with, a failure outside
the current area, a new file, an allowlist entry, an unknown foundation path.

## Verified test recipes

Four self-cleaning scripts for behaviour that needs Docker. They are for the main agent, never for
the cold-read agent, and they sit beside the scratch project, not inside it. Every recipe:

- is one script, saved in the scratchpad and run once with `bash <script>`, so that `trap cleanup
  EXIT` fires in the same shell (a kill by INT, TERM or HUP also runs the cleanup; SIGKILL cannot be
  trapped, so after one, list the containers and directories with the prefix and remove them by
  exact name);
- takes its inputs from environment variables and aborts with a message when one is missing; the
  scratch directory must be an absolute path (a relative one fails with a Docker volume-name error);
- uses a unique name `<prefix>-<seconds>-<pid>-<random>`, so two runs started in the same second do
  not collide, and touches only names that carry its own prefix;
- publishes nothing: no `-p` or `--publish` on `docker run`, no `ports:` in compose;
- never sets `container_name` and never pulls: it checks `docker image inspect` first, passes
  `--pull=never` to `docker run` and sets `pull_policy: never` in compose;
- never runs a prune or any other daemon-wide command.

Executed on 2026-10-27 against `ghcr.io/solidbunch/starter-kit-mariadb:11.8.9-noble` and
`alpine:latest`; the results are quoted in [Known pitfalls](#known-pitfalls).

Files next to this one, in `recipes/`:

- `recipes/recipe-a-mariadb-states.sh` (Recipe A): what one image does in a given state, for example
  a MariaDB version guard. Needs `IMG` and `SCRATCH`; it restarts one data directory in four states
  (fresh, patch-diff, other-series, other-series with `MARIADB_AUTO_UPGRADE=1`) and prints the exit
  code and log of each.
- `recipes/compare-image-guard.sh` (guard in the shipped image against the source): needs `IMG`,
  `FOUNDATION` (read only) and `SCRATCH`; diffs the guard in the image against the foundation file
  and prints the image creation time next to the commit time of the last change to that file. An
  image created before the source commit cannot contain that change; the diff is the proof.
- `recipes/recipe-b-restart-vs-recreate.sh` (Recipe B): proves that `docker compose restart` keeps
  the old compose config and `up -d --force-recreate` applies the new one. Needs `SCRATCH`;
  `BASEIMG` defaults to `alpine:latest` and must be a local image.
- `recipes/recipe-c-mariadb-probe.sh` (Recipe C): a fresh throwaway container of the shipped image
  plus an optional SQL file. Needs `IMG` and `SCRATCH`; optional `PROBE_SQL` (a file path) and
  `EXTRA` (extra `docker run` options such as `-e MARIADB_DATABASE=wordpress`; the script refuses
  publish, name, network and privileged options). Prints the host OS, file ownership, the SQL output
  and the last log lines.
- `recipes/scratch-project.sh` and `recipes/scratch-teardown.sh`: the scratch project (see
  "Providing a scratch project"); they are not Docker recipes.

Run them with `bash <file>`.

## Known pitfalls

Checklist of mistakes that a real audit made, kept in [known-pitfalls.md](known-pitfalls.md) next
to this file. Read it before verifying claims (step 2); it names six mistakes with the code lines to
read for each.

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

List every changed file with its full absolute path (per the user's standing preference), and the
claim-list files under a separate "audit files (gitignored)" line. Also report: known drift
(`[known-drift]` hits), `unexecuted` and `external` claims, open cold-read guesses (verbatim),
out-of-scope findings, areas or docs not examined, and any step that was not done. For each,
one line on what changed and why (e.g. "installation.md: removed step 8, `make certbot` no longer
exists — `Makefile` has no such target as of <date checked>"). If you skipped something you
noticed but weren't sure was in scope (e.g. a new file might be warranted, a section might need
deeper restructuring), report it — don't silently expand scope or silently drop it.
