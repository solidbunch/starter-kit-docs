---
name: make-doc
description: Audits and rewrites this repo's Markdown docs so every command, flag, path and default matches the real code in starter-kit-foundation. Adds documentation for new behaviour, deletes stale claims, strips addon-plugin/demo content, replaces live hostnames with placeholders. Verifies whole documents (never a git diff) with a writer, a verifier and a newcomer agent plus a zero-token gate. Trigger on "update the docs from code", "check docs against code", "audit docs for drift", "sync docs with the foundation repo", "make-doc", or when docs feel out of date.
---

# make-doc — reconcile docs with the code that actually ships

You are a technical writer whose only source of truth is code: every factual claim in this repo's
docs (command, flag, path, default, target, config key) must trace to a line of code in the
foundation checkout. No line, no claim. This is not a rewrite pass: leave correct prose alone and
touch only what drifted, found by verifying every claim of each selected doc, never from what
changed recently. You orchestrate; you read foundation code only to settle a conflict (step 7).

## Scope

**Arguments:** $ARGUMENTS

- If the argument text above is empty or still shows its placeholder (the harness did not
  substitute it) but the user wrote a request in chat, the chat request IS the argument.
- No argument and no request text at all → full sweep: every file listed in `index.md`.
- An argument → scoped run. It is free-form natural language, not a filename ("update the CI/CD
  doc", "обнови доку по CI/CD", "kit-modules docs"): match it by meaning against `index.md` and the
  "Area" column below. A scoped run is narrower, not shallower.
- A request phrased around changes ("update docs from the latest commits") is a scoped run whose
  areas come from the markers ([Picking areas](#picking-areas-from-a-change-phrased-request)).
  Every doc of a picked area is still verified in full.
- Ambiguous or matching nothing → say what you understood and ask; never guess, never fall back to a
  full sweep.
- A request that names part of a doc is a **mixed doc**: the in-scope part is a heading range, for
  example "from `## 🛠️ MariaDB Troubleshooting` to end of file", turned into line numbers with
  `grep -n '^#'`. Every agent gets the range and ignores the rest.

The unit of work is one document, verified in full; the unit of delivery is one area (a table row
below). A doc listed in several areas is verified once, against all of them, in the first area. A
doc in no area row goes with the area its commands point to; if none fits, report it.

## Ground truth: what to read

The foundation checkout may be named `starter-kit-foundation` or `starter-kit-foundation.loc`. Do
not guess: `node make-doc-gate.mjs --init` prints the real path (step 0). Ask the user only if it
reports "not found". Within it:

| Area                                                                  | Path                                                                                                                                          | Docs it feeds                                                                                                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root repo — Makefile, shell scripts, compose files, Dockerfiles, env templates     | `Makefile`, `sh/**`, `docker-compose*.yml`, `dockerfiles/**`, `config/environment/**`                                                                           | installation.md, makefile-reference.md, environment-and-secrets.md, docker-images.md, https-and-local-certificates.md, database-management.md, automatic-backups.md, sending-emails.md |
| kit-modules (independent modules, each invoked via a Makefile target) | `kit-modules/basis`, `kit-modules/monitoring-client`, `kit-modules/monitoring-server`, `kit-modules/proxy`                                    | infrastructure.md, makefile-reference.md                                                                                                                                               |
| Theme                                                                 | `web/wp-content/themes/starter-kit-theme` (may be a bundled dir or its own repo — check `.gitignore`/`composer.json` per the foundation's own `bootstrap-project` skill, `.claude/skills/bootstrap-project/` in the foundation checkout) | project-architecture-and-structure.md, ai-assisted-development.md, composer-usage.md                                                                                                   |
| CI/CD                                                                 | `.github/workflows/**`, `.gitlab-ci.yml`, `.gitlab/**`                                                                                        | ci-cd-deployments.md                                                                                                                                                                   |
| Root docs                                                             | `CLAUDE.md`, `README.MD`                                                                                                                      | overview.md, quick-start-after-purchase.md                                                                                                                                             |

Re-derive facts from these files every run; never trust a prior summary or the docs themselves.

### Out of scope — never document

- `web/wp-content/plugins/starter-kit-addon` and anything it provides (`IS_DEMO`, Stripe, demo
  seeding, the `docs-publisher` role, the `skt/v1` REST namespace): an optional extra that runs
  the demo site. Cite no code from under it.
- `scripts/` in this repo (the docs→WordPress publisher): never add it to `index.md`.
- Anything that only supports the demo/marketing site (demo hostnames, sales copy, purchase flow).

## Safety

Agents share the Docker daemon with the user's own stacks. These rules bind every agent you spawn
and you.

### Hard denylist

These commands are never run by anyone, any agent alike (main, code-scout, writer, verifier,
newcomer, fix-writer), even inside a scratch project or any other throwaway environment. Paths are
in the foundation checkout:

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

**Denylist one-liner.** The single canonical text for prompts. Prompts W and V get it pasted in
their slot; Prompt N already contains it.

```
make docker clean, make docker prune, any docker ... prune command, make db-tunnel, make mailhog, make pma, make watch, make install, make secret, make up, make upd, make recreate, make restart, make down, make localci, or anything that starts the project's compose stack, publishes a host port, uses a fixed container name, or acts on a global Docker namespace
```

### Read-only, risky, unexecuted

- **Read-only** = writes no files, starts/stops/removes no containers, touches no network accounts,
  cannot print secrets (help, version, status, non-secret files). Run it, but never inside the
  user's foundation checkout. `make -n` is not safe and `docker compose config` can print secrets
  outside a scratch project: treat any `make <target>` as risky unless its recipe only prints.
  When unsure, it is risky.
- **Risky** commands (anything that creates, deletes or overwrites data, containers or files) run
  only if not denylisted and only in the scratch project or a recipe below. Otherwise they are
  unexecuted: read the code instead, and list them in the report.
- The recipes in "Verified test recipes" are the one exception to the denylist's ban on `restart`,
  `recreate` and `down`: they run raw `docker compose` commands, but only in their own isolated
  project. A recipe whose image is not available locally aborts; the claim is then unexecuted.

### Scratch project

A file-only copy of the foundation; no container is ever started in it. From the copy root only
these are allowed: `make env [<type>]`, `bash sh/env/init.sh [<type>]`, `docker compose config`
(and `--services`), read-only `git`, reading generated files. It holds committed files only (no
`kit-modules/`, theme, `web/wp-core`, `db-data`; a dummy `.env.secret`) and has no `origin`. Create
it with `bash recipes/scratch-project.sh` (`FOUNDATION` and `SCRATCH` set; it prints the copy path
and `APP_NAME`) and delete it after the newcomer returns with `bash recipes/scratch-teardown.sh`
(`SCRATCH` and `COPY` set). Create one only for an edited procedural doc with an allowed command;
otherwise Prompt N gets `none prepared`.

## Verified test recipes

Four self-cleaning Docker recipes for behaviour that needs Docker. The writer and the verifier may
run them; the newcomer never does. Every recipe:

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

Files next to this one, in `recipes/`, run with `bash <file>`:

- `recipes/recipe-a-mariadb-states.sh` (Recipe A): one image, four data-directory states; `IMG`, `SCRATCH`.
- `recipes/compare-image-guard.sh`: image guard against the foundation file; `IMG`, `FOUNDATION`, `SCRATCH`.
- `recipes/recipe-b-restart-vs-recreate.sh` (Recipe B): `restart` against `up -d --force-recreate`; `SCRATCH`.
- `recipes/recipe-c-mariadb-probe.sh` (Recipe C): throwaway container of the shipped image plus an
  optional SQL file; `IMG`, `SCRATCH`, optional `PROBE_SQL` and `EXTRA` (publish, name, network and
  privileged options are refused). Prints host OS, file ownership, SQL output, log.
- `recipes/scratch-project.sh` and `recipes/scratch-teardown.sh`: the scratch project, not Docker recipes.

## Known pitfalls

Checklist of mistakes that a real audit made, in [known-pitfalls.md](known-pitfalls.md) next to this
file. The writer and the verifier read it; it names six mistakes with the code lines to read.

## Flow

Per area; areas run one after another. `<gate>` = `(cd <root>/scripts && node make-doc-gate.mjs ...)`,
`<root>` from `git rev-parse --show-toplevel` (the shell's working directory resets between Bash
calls, so use absolute paths). Agents are `general-purpose` with the `model` parameter, except the
map agent, type `code-scout`.

| # | Step | Who | What |
|---|---|---|---|
| 0 | Setup | main | `<gate> --init`: prints `foundation: <path> @ <sha> (clean/dirty)`, checks `scripts/node_modules` (missing → `(cd <root>/scripts && npm ci)`, report if that fails), saves the converter baseline. Run it before any edit. |
| 1 | Scope | main | Resolve the argument, read `index.md` and the Ground-truth table, fix in-scope heading ranges, ask the "ask the user" questions. |
| 2 | Claims | gate | `<gate> --claims=<doc>` or `--claims=<doc>:<from>-<to>`, repeatable: writes `.claude/doc-audit/<doc-slug>.claims.tsv` (location, kind, value, status), also when the checker exited 1. |
| 3 | Code map | `code-scout`, haiku | Prompt S. Save the reply to `.claude/doc-audit/<area>.map.md`. |
| 4 | Write | `general-purpose`, `model: sonnet` | Prompt W. One per area; one per doc if the in-scope text is over 400 lines. |
| 5 | Gate | main | `<gate> --compare-baseline` (add `--scope-docs=a.md,b.md` to limit the version warning). Output is at most 40 lines. |
| 6a | Verify | `general-purpose`, `model: opus` | Prompt V on the whole in-scope text, same split as step 4. Parallel with 6b. |
| 6b | Newcomer | `general-purpose`, `model: haiku` | Prompt N, one per edited doc that contains a procedure; none for unedited docs and pure reference pages. Parallel with 6a. |
| 7 | Decide and fix | main; optional fix-writer, `model: sonnet` | Main accepts or rejects each finding. Up to 10 small edits with given wording: main edits. More: one fix-writer with Prompt F. |
| 8 | Final gate | main | `<gate> --compare-baseline` must pass. |
| 9 | Deliver | main | Report, marker update, commit only if asked (see "Definition of done"). |

Before step 6b, if the doc has a command the scratch project allows, create it (Safety).

**Stop rule (hard).** Per area at most: 1 code-scout, 1 writer per split unit, 1 verifier per split
unit, 1 newcomer per edited procedural doc, 1 fix-writer. After step 8 no agent is spawned again for
that area. There is no second review loop and no second cold read.

- After every agent returns, run `git --no-optional-locks status --porcelain` in the docs repo and
  the foundation; revert an unexpected change by hand and report it.
- A verifier finding that contradicts the writer's evidence: open both cited lines (at most two
  Reads) and decide.
- A gate failure after step 7: fix it yourself if it is mechanical (link, converter, host).
  Otherwise report the area as "not ready: <reason>".
- A gate failure in a doc outside the area is reported, never fixed; the area is not delivered until
  the user decides: fix it, allowlist it (Allowlist rule), or widen scope (a new area run).
- Findings you do not apply go into the report verbatim.
- If you cannot spawn agents, the area is "blocked": never call it ready.
- At the end of the area `docker ps -a --format '{{.Names}}'` must show no container with a recipe
  prefix (for example `mdprobe-`); remove leftovers by exact name.

**Coverage check (step 6a).** The checker proves existence for every TSV row; the verifier checks
meaning. Compare its coverage lines with `grep -n '^##' <doc>` within the range and
"checker claims considered: N" with the number of TSV data rows (header excluded); on a mismatch list the missing headings in
the report, do not respawn.

**Newcomer (step 6b).** Drop gaps outside the in-scope part; fix the doc for each other gap or
note why it is not one. List its not-run commands in the report as unexecuted.

## Agent prompts

Fill the `<...>` slots and send the text as written. `<skill dir>` is the absolute path of
`.claude/skills/make-doc`.

### Prompt S — code-scout, haiku

```
Retrieve, do not judge. Foundation checkout (read only): <foundation path>.
In scope: <doc abs path> <whole file | lines a-b, from heading "X" to "Y">. Ignore the rest.
Checker claims (TSV): <claims tsv path>. Code areas: <area paths from the Ground-truth table>.
For every H2/H3 section in scope return:
## <heading> (doc lines a-b)
- <foundation path>:<lines> | <one verbatim code line that grounds a statement>
Cover every command, path, variable, default and "does / does not happen" statement. For each
make target give the Makefile recipe lines and the argument-parsing lines of the script it runs.
If no code grounds a statement: "NOT FOUND: <statement>". No explanations. Max 150 lines.
```

### Prompt W — writer, sonnet

```
Update user docs to match the code. The only truth is the foundation checkout <foundation path>:
read it, never run commands in it, never write to it.
Edit only the in-scope part: <doc abs path> <scope>. Do not touch anything outside it.
Inputs: code map <map path> (an index, open the lines yourself before relying on them); checker
claims <tsv path> (each must still be true when you finish); <skill dir>/known-pitfalls.md;
<skill dir>/house-style.md; "Converter limits" in <skill dir>/SKILL.md.
Rules:
- Minimal edits in the doc's own voice. Fix what is wrong, add what a user needs and the code
  does, delete what is gone or out of scope (addon plugin, demo site). Leave correct text alone.
- Every fact you keep, change or add needs a foundation path:line you opened. If it depends on
  Docker, the OS, MariaDB or WordPress core instead of foundation code: prove it with a recipe or
  word it no wider than the evidence (name the OS it holds for).
- Behaviour tests: run only `bash <skill dir>/recipes/<file>` with SCRATCH=<scratch abs path>
  and the env vars named in the file: recipe-a-mariadb-states.sh, compare-image-guard.sh,
  recipe-b-restart-vs-recreate.sh, recipe-c-mariadb-probe.sh (write PROBE_SQL files in the
  scratch dir). No other docker command. Never run: <denylist one-liner, verbatim from SKILL.md>.
- When done: (cd <docs repo>/scripts && node make-doc-gate.mjs --compare-baseline); fix what it
  reports in your docs; report failures elsewhere instead of fixing them.
Return, max 60 lines:
1. Edits: doc:line | change | evidence path:line or recipe + output line.
2. Recipe tests: statement | recipe | key output line | host OS.
3. Not verifiable here: statement | why (external, denylisted, no image).
```

### Prompt V — verifier, opus

```
Fact-check finished docs. Do not edit or create files in the docs repo.
Read ALL of this in-scope text, not a diff: <doc abs path — scope> (one line per doc).
Ignore everything outside it. Truth: foundation checkout <foundation path> (read only, never run
commands in it). Aids: code map <map path> (index only), <skill dir>/known-pitfalls.md, checker
claims <tsv paths> (existence is already proven; you check meaning and behaviour).
Check every statement: command arguments (read the script's argument parsing), defaults, which
value wins, step order, what does or does not happen, links to other sections, and facts that
other docs also state. Flag OVERREACH: claims wider than the code shows (Docker, OS, MariaDB,
WordPress behaviour; "always/never"; one platform presented as all). For each: give softer
wording, or test it with `bash <skill dir>/recipes/<file>` (SCRATCH=<scratch abs path>; files:
<recipe list>; no other docker command; never: <denylist one-liner, verbatim from SKILL.md>).
Return only:
A. Coverage: "<heading>: ok" or "<heading>: N findings", one line per in-scope H2/H3; then
   "checker claims considered: N".
B. Findings, max 20, most important first:
   doc:line | quote (≤ 15 words) | problem | evidence path:line or recipe output | exact fix wording
No praise, no summary, no style remarks unless wording is wrong about behaviour.
```

### Prompt N — newcomer, haiku

```
You are a first-time user. Follow <doc abs path>, only <scope>, step by step. Ignore the rest of
the file unless the in-scope part links to it. Do not edit files.
Reading: you may read any file: the docs in <docs repo>, and the foundation checkout
<foundation path> (read it to confirm that something the doc leaves unstated is really unstated).
Running: never run a command inside <foundation path>. Never run anywhere: make docker clean, make docker prune, any docker ... prune command, make db-tunnel, make mailhog, make pma, make watch, make install, make secret, make up, make upd, make recreate, make restart, make down, make localci, or anything that starts the project's compose stack, publishes a host port, uses a fixed container name, or acts on a global Docker namespace. Never touch cloud, registry or CI
accounts or real credentials. Run a command only if it is read-only
(could it print a secret? then it is not), or it is allowed in this scratch project and you run it
there: <copy path, APP_NAME, "allowed there: make env [<type>], bash sh/env/init.sh [<type>],
docker compose config, read-only git, reading files" | none prepared>.
Return:
1. Gaps, max 12: doc:line | what you had to guess (missing prerequisite, undefined term or value,
   value used before it is introduced, ambiguous "step N"/"above", unstated result, a command
   whose real result differed) | what would remove the guess.
2. Commands run: command | where | expected | actual.
3. Commands not run: command | reason.
Only gaps inside the scope. No verdict, no summary, no style remarks.
```

### Prompt F — fix-writer, sonnet

Only when step 7 has more than 10 edits.

```
Apply exactly these accepted findings to <doc abs path>, nothing else, in the doc's own voice:
<findings verbatim>. Respect <skill dir>/house-style.md and "Converter limits" in
<skill dir>/SKILL.md. Then run
(cd <docs repo>/scripts && node make-doc-gate.mjs --compare-baseline) and return:
doc:line | applied wording, plus the gate's FAIL lines if any. Max 30 lines.
```

## Picking areas from a change-phrased request

A commit date is not proof that docs were verified. The anchor is `scripts/doc-audit-verified.txt`:
per area, the foundation commit its docs were last fully verified against (format: its header
comment). Area keys, one per Ground-truth row, top to bottom: `root-repo`, `kit-modules`,
`theme`, `ci-cd`, `root-docs`.

1. Read the marker file. Read the foundation head with
   `git --no-optional-locks -C <foundation path> rev-parse HEAD` and keep it as the verification
   sha of every area of this run. Run `git --no-optional-locks -C <foundation path> status
   --porcelain`: uncommitted foundation changes are not in the log; report them.
2. Per area: **no marker line** or a **marker sha not in the history** (`git --no-optional-locks -C
   <foundation path> cat-file -e <sha>^{commit}` fails) → never audited. Otherwise list
   `git --no-optional-locks -C <foundation path> log <sha>..HEAD --name-only --format='%h %s'`; the
   area is due if a changed file maps to it through the Ground-truth paths. Files that map to no
   area are listed in the report as "unmapped changes".
3. Run every area that is due, each in full (never from the diff).
4. Never-audited areas are expensive: do not start them silently. List them and ask which first.
5. Nothing due and nothing never-audited → report "all areas verified up to <sha>; nothing to do"
   and stop. Otherwise, after the due areas, stop, report the areas not examined and offer to
   continue. Never silently skip them and never silently run a full sweep.

Every git call on the foundation uses `git --no-optional-locks` (a plain `status` can write its `.git/index`).

## Writing rules

### Converter limits — avoid these while writing

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

### Placeholders

Any live or demo hostname on `starter-kit.io` (and subdomains) becomes a per-project placeholder
(`<your-domain>`, `<dev-host-alias>`, `<prod-host-alias>`; pattern in `ci-cd-deployments.md`).
`licensing.starter-kit.io`, the bare `https://starter-kit.io` and `.loc` hostnames stay. A new
placeholder is angle-bracketed and obvious from context. The gate enforces this.

### Allowlist rule

Never edit the checker; report a suspected false positive. The only file you may edit is
`scripts/doc-claims-allowlist.txt`: an `[allowed]` entry (legitimate non-match) or a `[known-drift]`
entry (real drift not fixable now), one per claim, with a reason. Propose the exact entry and write
it only after the user's explicit OK (format: "Doc claims check" in `scripts/README.md`). Never hide
drift you could fix.

### index.md sync

When a file is added, removed or renamed, update `index.md`'s TOC, with each link text equal to the
file's first `# Heading`. A new file is a bigger call: flag it to the user and wait.

### House style

See [house-style.md](house-style.md) (moved there verbatim). Apply it only to passages you are
already touching; report other style problems without fixing them.

## Definition of done, and when you're done

An area is ready only when: the final gate (step 8) passes with only `[known-drift]` hits left, each
reported; the verifier ran on every in-scope doc and the newcomer on every edited procedural doc;
every finding is applied or listed; risky commands ran in an allowed environment or are listed as
unexecuted.

- Do **not** commit unless the user asked for commits (or invoked the project's commit workflow).
  Otherwise report "ready to commit: <area>, files: ..." and continue with the next area. When
  committing: one commit per area (its docs, `index.md` if changed, an approved allowlist change,
  the marker line), made with the `commit` skill, never `--no-verify`, no AI attribution lines,
  never pushed. An area with no changed doc gets no commit.
- **Record the verification.** Set the area's line in `scripts/doc-audit-verified.txt` to
  `<area-key> <foundation sha> <YYYY-MM-DD>`, using the foundation head read at the start of the
  area (never a later one), only when the definition of done is met. Never for a blocked, partly
  verified or "not ready" area. List the marker change in the report.
- The only places where you wait for the user: an ambiguous argument, which never-audited area to
  start with, a failure outside the current area, a new file, an allowlist entry, an unknown
  foundation path.

Report: every changed file with its full absolute path, the gitignored audit files on a separate
"audit files" line, and one line of why per edit (e.g. "installation.md: removed step 8, `make
certbot` no longer exists"). Also: known drift, unexecuted and external claims, findings not applied
and newcomer gaps still open (both verbatim), out-of-scope findings, areas or docs not examined,
coverage mismatches, agents spawned per role, any step not done. If unsure whether something was in
scope, report it; do not silently expand scope or drop it.
