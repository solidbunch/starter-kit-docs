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
   runs on every push to `main` or `develop`: an offline test suite gates a live publish.
   `main` publishes to the **production** site (`starter-kit.io`), `develop` to the
   **development** site (`develop.starter-kit.io`) — same split as the app repos' own
   dev/prod deploys (see `ci-cd-deployments.md`).
2. **By hand** — from a local checkout, for previewing changes before they're pushed (see
   `scripts/README.md` for the full CLI walkthrough).

Sync is **one-way**: Markdown here is the source of truth. An edit made directly in WordPress is
overwritten on the next push — see `scripts/README.md`'s "One-way sync" section if you have
WP admin access.

### Publishing setup (GitHub Actions)

The workflow picks its target by branch via a GitHub **Environment** (`environment:` on the
`sync` job) — `main` → `production`, `develop` → `development` — so the same three secret
*names* can hold different values per branch, same idea as the app repos' GitLab CI
environment-scoped variables.

To make the automatic pipeline work, in the GitHub repo set:

1. **Settings → Environments → New environment** — create two: `production` and `development`.

2. **For each environment, add all three secrets** (environment secrets, not repository secrets
   — that's what makes the same name resolve differently per branch):

   | Secret | `production` value | `development` value | Notes |
   |---|---|---|---|
   | `WP_BASE_URL` | `https://starter-kit.io` | `https://develop.starter-kit.io` | **Must be `https://`** unless the target's WordPress `environment_type` is `local` — Application Passwords are rejected over plain HTTP otherwise. |
   | `WP_USER` | a dedicated user's login, assigned the `docs-publisher` role, on that site | — | See "Target site prerequisites" below — the role itself is created automatically. |
   | `WP_APP_PASSWORD` | that user's Application Password | — | Generated in wp-admin → Users → Profile → Application Passwords, one per site. |

3. **Target site prerequisites** (one-time, in wp-admin on **each** of the two sites):
   - `starter-kit-addon` active — it creates the `docs-publisher` role automatically (`read` plus
     ten doc-page-scoped primitives: `edit_doc_pages`, `edit_others_doc_pages`,
     `edit_published_doc_pages`, `edit_private_doc_pages`, `publish_doc_pages`,
     `read_private_doc_pages`, `delete_doc_pages`, `delete_others_doc_pages`,
     `delete_published_doc_pages`, `delete_private_doc_pages` — explicitly not
     `edit_pages`/`edit_published_pages`/`publish_pages`/`edit_others_pages` or any other core Page
     capability, so it cannot touch core WP Pages, and explicitly not `unfiltered_html` or
     `manage_options`); the only manual step is assigning that role to a dedicated user
   - the `skt/v1/serialize-blocks` REST endpoint present (`starter-kit-addon`) and the `doc-page`
     custom post type registered under the `skt/v1` REST namespace

4. (Recommended for `production`) **Settings → Environments → production → Deployment
   protection rules** — require a reviewer before a `main` push actually publishes live, same
   recommendation as the app repos' "Protected environments" for their prod deploy.

5. **If a target isn't publicly reachable** (e.g. a LAN-only staging box) — change `runs-on:`
   on the workflow's `sync` job to a self-hosted runner label; nothing else needs to change.

6. (Recommended) verify your GitHub notification settings once — profile → Settings →
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
