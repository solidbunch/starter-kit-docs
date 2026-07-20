# AI-Assisted Development (Claude Code)

StarterKit ships with built-in guidance for [Claude Code](https://docs.claude.com/en/docs/claude-code) —
Anthropic's CLI coding agent. Every layer of the stack (Foundation, the theme, each licensed
kit-module) carries its own `CLAUDE.md` and, where needed, topic-scoped rule files under
`.claude/rules/`. Claude Code loads these automatically based on the files you're working with —
there's no setup required beyond having Claude Code installed and running it inside the project.

This is optional. Everything Claude does here is the same thing you'd do by hand from
[Installation](installation.md) and [Usage](usage.md) — it just automates the repetitive parts and
already knows the project's conventions, hard rules, and folder layout.

---

## 1. What's included

| Layer                | Lives in                                                  | Loads when                                                        |
|-----------------------|------------------------------------------------------------|---------------------------------------------------------------------|
| **Foundation**        | root `CLAUDE.md`, `.claude/rules/*.md`                     | always (root rules), or by path — e.g. editing `docker-compose*.yml`, `.github/workflows/**`, `config/**` |
| **Theme**              | `web/wp-content/themes/<theme>/CLAUDE.md` (+ `blocks/CLAUDE.md`) | auto-loaded when Claude reads a file inside the theme folder       |
| **Kit-modules**        | `kit-modules/<module>/CLAUDE.md`                            | auto-loaded when Claude reads a file inside that module's folder   |

Each layer documents only its own concerns and points back to the others — you don't need to open
or reference these files yourself, just start Claude Code from the project root and work normally.

---

## 2. Available skills

A **skill** is a packaged, repeatable workflow Claude runs on request (typed as `/skill-name` or
triggered by describing what you want in plain English). StarterKit ships these:

| Skill                        | Where                                                                                   | Use it to                                                                                                  |
|-------------------------------|------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `bootstrap-project`           | `.claude/skills/bootstrap-project/`                                                       | Turn a freshly cloned template into a named, running project — the main entry point, see §3 below.          |
| `create-gutenberg-block`      | `web/wp-content/themes/<theme>/.claude/skills/create-gutenberg-block/`                    | Scaffold a new Gutenberg block following the theme's existing block conventions.                            |
| `convert-to-classic-theme`    | `web/wp-content/themes/<theme>/.claude/skills/convert-to-classic-theme/`                  | Switch the theme from FSE (Full Site Editing) to classic PHP templates. Keeps Gutenberg/blocks — only the page-assembly mechanism changes; the block editor becomes a per-post-type opt-in. |
| `create-classic-template`     | `web/wp-content/themes/<theme>/.claude/skills/create-classic-template/`                   | Turn a static HTML design handoff (blog, landing, listing page) into a classic PHP template, reusing existing blocks/repositories/Page Builder Carbon Fields contract. Requires the theme already converted to classic. |

Theme skills aren't auto-discovered from a Foundation-only Claude Code session (skill
auto-discovery is project-root scoped) — ask Claude to read and follow them by their path directly,
or `cd` into the theme's own working copy and run Claude Code there.

You may also have general-purpose skills installed globally on your machine (not shipped by
StarterKit) — e.g. a `project-brief` skill that writes/updates `CLAUDE.md` files from a project
scan. `bootstrap-project` will use it in its final step if it's available, but it isn't required.

---

## 3. Starting a new project with Claude Code

This is the recommended sequence when you're starting a **brand-new project** from this template,
replacing the manual steps in [Installation](installation.md):

1. **Clone the template** (pick any method from [Installation](installation.md) or
   [Advanced Installation Options](advanced-installation-options.md)):

   ```bash
   git clone https://github.com/solidbunch/starter-kit-foundation.git my-project
   cd my-project
   ```

2. **Start Claude Code** in the project root:

   ```bash
   claude
   ```

3. **Ask it to bootstrap the project** — e.g. *"bootstrap this project"* or *"start a new project
   from this template"*. This triggers the `bootstrap-project` skill, which will:

   - Ask you (once, batched) for the project slug (`APP_NAME`), title (`APP_TITLE`), and local
     domain (`APP_DOMAIN`) — plus optional dev/stage/prod domains if you already have them.
   - Ask whether to keep the default theme name or rename it (cosmetic rename only — internal PHP
     namespace/prefixes stay unless you explicitly ask to change those too).
   - Edit the source env files under `config/environment/` (never the generated `.env`/`.env.runtime`).
   - Run `make secret` and `make env local` to regenerate the derived env files, and show you the
     result to confirm before continuing.
   - Confirm with you, then run `make install` (builds and starts Docker containers — this is the
     one step in the flow that touches your machine's Docker daemon).
   - Rename the theme, if you asked for that, using the theme's own `wp clone-theme` WP-CLI command.
   - Refresh `CLAUDE.md` / `.claude/rules/` for the renamed project, if a `project-brief`-style skill
     is available.
   - Report every changed file, split into what it did automatically vs. what's left for you
     (`/etc/hosts` entry, GitHub repo/CI secrets, kit-modules licensing — see [Infrastructure](infrastructure.md)).

   Nothing gets committed automatically — review the diff and commit it yourself.

4. **Add your domain to `/etc/hosts`** if it doesn't end in `.localhost` (Claude will remind you),
   then open the site to confirm it's running — see [Installation §4](installation.md).

5. **Decide on the page-assembly approach**, if you haven't already: the theme ships as FSE by
   default. If your project needs classic PHP templates instead, ask Claude to run
   `convert-to-classic-theme` — safe to run any time after step 3, not something you need to
   decide up front.

6. **Build out the theme** as you normally would — for new Gutenberg blocks, ask Claude to run
   `create-gutenberg-block`; for turning a design handoff into a template (once classic), ask for
   `create-classic-template`. Ongoing edits benefit from the theme's own `CLAUDE.md` automatically —
   no extra step needed.

7. **Set up infrastructure and CI/CD when you're ready to deploy** — this is a separate, later task
   (not part of bootstrapping): licensing the `kit-modules` packages, running Terraform/Ansible, and
   wiring GitHub Actions secrets. See [Infrastructure](infrastructure.md) and
   [CI/CD Deployments](ci-cd-deployments.md). Ask Claude to walk you through it when you get there —
   it reads the same rule files described in §1.

---

## 4. What Claude will (and won't) do on its own

The project's rules encode hard boundaries Claude respects in every session:

- Never commits `.env`, `.env.runtime`, `.env.secret`, `.tfstate`, `.pem`, or any credential file.
- Never edits WordPress core (`web/wp-core/`) or `vendor/` directly — both are Composer-managed.
- Never edits `web/wp-core/wp-config.php` — the source of truth is `web/wp-config/wp-config.php`.
- Never force-pushes to `main`/`develop`, and won't run destructive Docker/DB commands without
  confirming with you first.
- Treats scope narrowly — a bootstrap or a bugfix stays a bootstrap or a bugfix; anything it
  notices outside the current task gets reported, not silently fixed.

If you ever want to know exactly what context Claude has loaded for the current file, that's
visible in Claude Code's own session tooling (e.g. the `/memory` command) — it will show you which
`CLAUDE.md`/rule files applied.
