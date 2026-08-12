# Starter Kit Documentation

### [Website](https://starter-kit.io) | [Published Docs](https://starter-kit.io/docs/overview/)

📚 Official documentation for the WordPress Starter Kit by [SolidBunch](https://github.com/solidbunch)

This repository is the source of truth for all Starter Kit documentation

---

## 📦 Related Projects

- [`starter-kit-foundation`](https://github.com/solidbunch/starter-kit-foundation) — the framework core
- [`starter-kit-theme`](https://github.com/solidbunch/starter-kit-theme) — WordPress theme built on Foundation

---

## 🚀 How it's published

Docs here are converted to Gutenberg block markup and published to the Starter Kit's own
WordPress site (as the `doc-page` custom post type, not generic Pages) by the sync tooling in
[`scripts/`](scripts/). Two ways it runs:

1. **Automatically** — [`.github/workflows/publish-docs.yml`](.github/workflows/publish-docs.yml)
   runs on every push to `master`: an offline test suite gates a live publish.
2. **By hand** — from a local checkout, for previewing changes before they're pushed (see
   `scripts/README.md` for the full CLI walkthrough).

Sync is **one-way**: Markdown here is the source of truth. An edit made directly in WordPress is
overwritten on the next push — see `scripts/README.md`'s "One-way sync" section if you have
WP admin access.

### Publishing setup (GitHub Actions)

To make the automatic pipeline work, in the GitHub repo set:

1. **Settings → Secrets and variables → Actions → New repository secret** — add all three:

   | Secret | Value | Notes |
   |---|---|---|
   | `WP_BASE_URL` | e.g. `https://starter-kit.io` | **Must be `https://`** unless the target site's WordPress `environment_type` is `local` — Application Passwords are rejected over plain HTTP otherwise. |
   | `WP_USER` | the `docs-publisher` user's login | See "Target site prerequisites" below for how that role/user is created. |
   | `WP_APP_PASSWORD` | that user's Application Password | Generated in wp-admin → Users → Profile → Application Passwords. |

2. **Target site prerequisites** (one-time, in wp-admin on the site `WP_BASE_URL` points at):
   - a `docs-publisher` role (only `edit_pages`/`edit_published_pages`/`publish_pages`/`edit_others_pages`
     — explicitly not `unfiltered_html` or `manage_options`) assigned to a dedicated user
   - the `skt/v1/serialize-blocks` REST endpoint present (`starter-kit-addon`) and the `doc-page`
     custom post type registered

3. **If the target isn't publicly reachable** (e.g. a LAN-only staging box) — change `runs-on:`
   on the workflow's `sync` job to a self-hosted runner label; nothing else needs to change.

4. (Recommended) verify your GitHub notification settings once — profile → Settings →
   Notifications → Actions — email-on-failure is opt-in, not a default.

No self-hosted runner is required for a publicly reachable target — this pipeline targets
GitHub-hosted `ubuntu-latest` runners out of the box. Full detail, edge cases, and the local CLI
usage all live in `scripts/README.md`.

---

## 🛠 How to Contribute

1. Fork this repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Edit or add a `.md` file at the repo root, and update `index.md`'s table of contents to match
   (add/rename/remove entries as needed — see `CLAUDE.md` for the full convention)
4. Open a pull request
