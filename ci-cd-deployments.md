# CI/CD Deployments

Two ready-to-use pipelines ship with the project: GitHub Actions (`.github/workflows/`) and
GitLab CI/CD (`.gitlab-ci.yml` + `.gitlab/ci/`). Both deploy the same way — build, then `rsync`
the code to the server and run a `make` sequence over SSH — and both can also **provision**
servers (Terraform + Ansible). Both need a one-time setup on the Git hosting side before the first
pipeline run will work. Pick whichever hosting you use; they don't depend on each other and can
coexist.

> 💡 If you set the project up with the `bootstrap-project` Claude Code skill, check the project's
> `README.md` first. If its "CI/CD setup" section has real values, "Before you start" is already
> done.

## Before you start (both pipelines)

### 1. Set your project's identity in `.env.main`

Open `config/environment/.env.main` and set the values for the platform you use. They are only
needed for provisioning: they go into the AWS trust policies (Step 3 of your platform's section),
which let only your repository's pipelines assume the AWS roles.

| Platform | Settings to edit | What to set |
| -------- | ---------------- | ----------- |
| GitHub   | `GITHUB_ORG`, `GITHUB_REPO` | The GitHub org and repo this code lives in. They ship with SolidBunch's own values (`solidbunch`, `starter-kit-foundation`). |
| GitLab   | `GITLAB_PROJECT_PATH`, `GITLAB_PROJECT_ID`, `GITLAB_HOST`, `GITLAB_PROVISION_BRANCHES` | The project path (`group/project`), the numeric project ID (checked only when `GITLAB_HOST` is `gitlab.com`), your GitLab host (default `gitlab.com`; change it for self-managed GitLab), and the branches allowed to provision (default `main develop`). |

The names of the AWS roles (`ROLE_NAME`, `BOOTSTRAP_ROLE_NAME`; for GitLab `GITLAB_ROLE_NAME`,
`GITLAB_BOOTSTRAP_ROLE_NAME`) are in the same file; the defaults are fine unless a role with that
name already exists in your AWS account.

> 💡 The Terraform state bucket name (`TF_VAR_tf_backend_bucket`) needs no edit: it is derived from
> `APP_NAME`. State locking is built into S3, so there is no lock table to set up.

### 2. Know how the deploy target is resolved

Set `APP_DOMAIN` in `config/environment/.env.type.dev` and `.env.type.prod` to the domain of each
server, and commit (projects renamed with `bootstrap-project` already have this). The deploy job
reads it from there and uses it as both the SSH host and the deploy path (`/srv/$APP_DOMAIN`), so
no CI/CD variable is needed for the deploy target:

```dotenv
# config/environment/.env.type.dev
APP_DOMAIN=develop.<your-domain>
```

```dotenv
# config/environment/.env.type.prod
APP_DOMAIN=<your-domain>
```

> ⚠️ **Contract:** the `Host` block in your `SSH_CONFIG` secret/variable (below) must be named
> **exactly** `APP_DOMAIN`'s value for that environment. The deploy job runs `ssh "$APP_DOMAIN"`
> — if your SSH alias doesn't match, it fails with `Could not resolve hostname`.

`config/environment/.env.type.stage` has its own `APP_DOMAIN`, but there is no stage deploy
workflow yet.

### 3. Generate a deploy SSH key pair

```bash
ssh-keygen -t ed25519 -f deploy_key -N ""
```

Use a dedicated key, not your personal one. The private half becomes the `SSH_KEY` secret (set up
per pipeline below). For a server that GitHub provisioning creates, the public half is derived from
`SSH_KEY` and installed automatically. For a server you already have, add the public half to
`~/.ssh/authorized_keys` yourself (see GitHub Actions, Step 5).

Now continue with whichever pipeline(s) you use.

---

## GitHub Actions

Workflow files in `.github/workflows/`:

| File                             | Trigger                             | What it does                                                                                      |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `workflow-deploy-develop.yml`    | push to `develop` branch, or manual | deploys to **dev** (host derived from `APP_DOMAIN` in `.env.type.dev`)                            |
| `workflow-deploy-production.yml` | manual only                         | deploys to **prod** (host derived from `APP_DOMAIN` in `.env.type.prod`) — no auto-deploy on push |
| `job-bootstrap-state.yml`        | manual only                         | creates the Terraform state bucket, once per AWS account (Step 4)                                 |
| `job-provision.yml`              | manual only                         | provisions infrastructure (Terraform + Ansible) for `dev` / `prod`                                |

**Servers already exist?** Do Steps 1 and 7, and Step 8 if you want it. Steps 2–6 are for
provisioning new servers on AWS.

**Provisioning new servers?** Do the steps in order, with one loop: Step 3 creates the two AWS
roles, and you then go back to Step 2 to paste their ARNs before Step 4 creates the Terraform state
bucket. Step 5 needs both. Steps 6 and 8 are optional.

You don't need to create anything under **Settings → Environments** first: GitHub creates
`dev`/`stage`/`prod` automatically the first time a workflow uses one.

### Step 1 — add the required secrets

Go to **Settings → Secrets and variables → Actions → Secrets** and add:

| Secret              | Required? | Used by            | What it is                                                                                                                                 |
| ------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SSH_KEY`           | **yes**   | deploy + provision | Private key from the deploy pair generated above (server access)                                                                           |
| `SSH_CONFIG`        | **yes**   | deploy + provision | SSH client config for the servers — see example below. Host-key trust comes entirely from this file, no separate known-hosts secret needed |
| `COMPOSER_AUTH`     | **yes**   | deploy + provision | Unlocks licensed Composer packages (kit modules)                                                                                           |
| `TFPLAN_PASSPHRASE` | no        | provision only     | Enables encrypted Terraform plan review — see Step 6                                                                                       |

`SSH_CONFIG` example — each `Host` alias must be exactly that environment's `APP_DOMAIN` value
(see "Know how the deploy target is resolved" above):

```conf
# SSH_CONFIG
Host *
   IdentitiesOnly yes
   StrictHostKeyChecking no

# Dev server — Host must equal .env.type.dev's APP_DOMAIN exactly
Host develop.<your-domain>
  HostName <dev server IP or hostname>
  User serverusername
  Port 22

# Prod server — Host must equal .env.type.prod's APP_DOMAIN exactly
Host <your-domain>
  HostName <prod server IP or hostname>
  User serverusername
  Port 22
```

`COMPOSER_AUTH` is a [Composer authentication](https://getcomposer.org/doc/articles/authentication-for-private-packages.md)
JSON object holding a Personal Access Token — see [Managing your personal access tokens on GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
For the GitHub secret, escape it; for local `.env.secret` usage, don't:

```bash
# GitHub secret value
{\"github-oauth\":{\"github.com\":\"ACCESS_TOKEN_GITHUB\"}}

# local .env.secret value
{"github-oauth":{"github.com":"ACCESS_TOKEN_GITHUB"}}
```

If you also have paid `kit-modules` licenses, add an `http-basic` entry for
`licensing.starter-kit.io` to the same JSON object instead of a separate secret:

```bash
{\"github-oauth\":{\"github.com\":\"ACCESS_TOKEN_GITHUB\"},\"http-basic\":{\"licensing.starter-kit.io\":{\"username\":\"<your email>\",\"password\":\"<your license password>\"}}}
```

Dependabot needs its own, separate copy of these licensing credentials — it can't read the
`COMPOSER_AUTH` secret above. See the "Dependabot" section near the end of this page.

### Step 2 — add the AWS role variables

Go to **Settings → Secrets and variables → Actions → Variables** (repo-level):

| Variable                       | Level | Required?        | Used by              | What it does                                                                                                                      |
| ------------------------------ | ----- | ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_ROLE_TO_ASSUME`           | repo  | for provisioning | provision            | ARN of the AWS role that runs Terraform and Ansible (the *everyday provisioning role*). Leave empty until Step 3 gives you the ARN |
| `AWS_BOOTSTRAP_ROLE_TO_ASSUME` | repo  | for provisioning | state bootstrap only | ARN of the narrower AWS role that only creates the Terraform state bucket (the *bootstrap role*, used in Step 4). Leave empty until Step 3 gives you the ARN |

There's no deploy-target variable to set here — see "Know how the deploy target is resolved"
above. There's no AWS region variable either — it's read automatically from
`config/environment/.env.main`.

Optional: to set `APP_MULTI_INSTANCE` per server, see Step 8.

### Step 3 — cloud side: create the AWS roles GitHub will assume

Create an IAM identity provider and two IAM roles in your AWS account, so that GitHub can provision
without stored access keys (this uses OpenID Connect, OIDC). The roles are scoped to your GitHub
org/repo (the `GITHUB_ORG`/`GITHUB_REPO` values from "Before you start"). Each run assumes a role
and gets temporary credentials:

- **Everyday provisioning role** (`AWS_ROLE_TO_ASSUME`) — used by every provisioning run. It cannot
  create the Terraform state bucket, by design.
- **Bootstrap role** (`AWS_BOOTSTRAP_ROLE_TO_ASSUME`) — narrower, used once by Step 4, only to
  create the state bucket.

> 💡 The shipped Terraform/Ansible code targets AWS. Other clouds support the same pattern (GCP
> Workload Identity Federation, Azure federated credentials), but you would adapt the code yourself.

The project ships a helper that prints the exact AWS console steps and ready-to-paste policies for
both roles (using your project's bucket name and the GitHub org/repo you set in "Before you
start"):

```bash
make oidc dev gen
```

Run it from the project root after `make install` or `make env <env>` — the script reads the
generated `.env`. It only prints values and you create the resources in the AWS Console yourself,
so it needs neither the AWS CLI nor credentials. In a terminal it pauses after each part: do that
part, then press Enter. Its output has three parts, labelled STEP 0, 1 and 2 (not the Steps of this
page):

- **STEP 0 — identity provider** (once per AWS account; skip it if the provider already exists).
  **IAM → Identity providers → Add provider** — Provider type `OpenID Connect`, Provider URL
  `token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`.
- **STEP 1 — everyday provisioning role** (`ROLE_NAME` in `.env.main`).
  1. **IAM → Roles → Create role → Web identity** — the identity provider and audience from
     STEP 0 and your GitHub org/repo. Skip adding permissions for now.
  2. **IAM → Roles → your role → Trust relationships → Edit trust policy** — replace the policy
     with the printed one.
  3. **IAM → Policies → Create policy → JSON** — paste the printed permissions JSON (read/write on
     the Terraform state bucket, plus `ec2:*`). Then attach the policy under **IAM → Roles → your
     role → Permissions → Attach policies**.
- **STEP 2 — bootstrap role** (`BOOTSTRAP_ROLE_NAME`). The same three actions, with its own printed
  trust policy (limited to the `main` branch) and permissions JSON (create and configure the state
  bucket).

For each role the script prints the ARN to store, with `<ACCOUNT_ID>` as a placeholder. Replace it
with your 12-digit AWS account ID (top-right in the AWS Console).

**Now go back to this page's Step 2 and set `AWS_ROLE_TO_ASSUME` and
`AWS_BOOTSTRAP_ROLE_TO_ASSUME` to those ARNs.**

Optional, to verify what you created: this checks the identity provider, both trust policies and
the attached policies against your real AWS account. It needs the AWS CLI installed locally and
configured with credentials that can read IAM:

```bash
make oidc dev test
```

Do Step 3 once per AWS account you deploy to — the same roles can be reused across `dev`, `stage`
and `prod` if they share an account.

### Step 4 — create the Terraform state bucket (once)

Provisioning expects the S3 bucket that stores Terraform state to exist already; the everyday role
cannot create it. Create it once per AWS account: repo → **Actions** tab → *Bootstrap Terraform
State Backend* in the left sidebar → **Run workflow**, with branch `main` selected (the bootstrap
role trusts only `main`). The only input is `CONFIRM`: type the AWS region exactly as it is set in
`TF_VAR_aws_region` in `config/environment/.env.main`. A mismatch stops the run before it touches
AWS.

### Step 5 — provision the server(s)

Creates the server (Terraform) and installs required software (Ansible), using the `SSH_KEY`
secret from Step 1, the AWS roles from Step 3 and the state bucket from Step 4:

- **Preferred:** repo → **Actions** tab → *Provision Infrastructure* in the left sidebar →
  **Run workflow**, choosing:
  
  - `ENVIRONMENT_TYPE`: `dev` or `prod`. `stage` is listed but rejected: Ansible has no `stage`
    host (details in [Infrastructure](infrastructure.md#setup-infrastructure-with-terraform))
  - `ACTION_TYPE`: `plan` (preview only — always run this first), `apply`, or `destroy` (tears
    infrastructure down, only on purpose)
  - `SKIP_ANSIBLE`: leave unchecked unless you specifically want Terraform-only (no server
    software installed)

- **Manual/local alternative**, in this exact order (later layers depend on the earlier ones;
  skip `make tf state apply` if you already ran Step 4):
  
  ```bash
  make tf state apply
  make tf shared apply
  make tf dev apply      # or: make tf prod apply
  make ansible dev inventory && make ansible dev playbook   # or: prod
  ```

- **Already have a server?** If you're pointing at server(s) set up outside this project's
  Terraform/Ansible, skip this step entirely — just make sure the public half of the deploy key
  pair (from "Before you start", item 3) is on the server (e.g. in `~/.ssh/authorized_keys` for the
  deploy user) and the required software is installed.

Check the **Actions** tab for logs after any run.

### Step 6 — optional: reviewed Terraform plans

If you add the optional `TFPLAN_PASSPHRASE` secret (Step 1), the provisioning workflow gets a
"plan → review → apply" safety flow instead of always re-planning right before applying:

1. Run the workflow with `ACTION_TYPE: plan`. The plan is encrypted and attached to that run as
   an artifact.
2. Review the plan output in the run logs.
3. Run the workflow again with `ACTION_TYPE: apply` and `PLAN_RUN_ID` set to the plan run's ID —
   it applies exactly the reviewed plan instead of generating a new one.

If `TFPLAN_PASSPHRASE` isn't set, this is skipped automatically (a warning is written to the run
summary) and `apply` just plans and applies in the same run — nothing breaks.

### Step 7 — deploy

- **Dev**: push to `develop`, or run `workflow-deploy-develop.yml` manually from the **Actions**
  tab.
- **Prod**: run `workflow-deploy-production.yml` manually from the **Actions** tab.

Check the **Actions** tab for logs after any run.

### Step 8 — optional: GitHub Environments

Create an Environment by hand only if you want one of these:

- **Gate deploys/provisioning** (optional, recommended for `prod`): **Settings → Environments →
  New environment**, named exactly `dev`/`stage`/`prod` → open it → add **required reviewers**
  and/or a **wait timer** under protection rules. This gates both the deploy and the provisioning
  pipeline for that environment.
- **Scope `APP_MULTI_INSTANCE` per server**: create the Environment first, then add the variable
  inside that environment's own **Variables** section. A repo-level value would turn it on for
  prod too. See
  [Infrastructure → Reverse proxy (multi-instance)](infrastructure.md#reverse-proxy-multi-instance)
  for what `APP_MULTI_INSTANCE` does.
- **Different `SSH_KEY`/`SSH_CONFIG`/`COMPOSER_AUTH` per environment** (rare — most projects use
  the same deploy key and Composer auth everywhere): add an environment-scoped secret with the
  same name inside that environment's own **Secrets** section; it overrides the repo-level one for
  runs pinned to that environment. GitLab has its own equivalent, described under "GitLab CI/CD"
  below.

> Environments with their own secrets/variables work on a public repo on any GitHub plan. On a
> **private** repo you need GitHub Pro, Team, or Enterprise.

### Dependabot

`.github/dependabot.yml` ships with two update sources, both opening PRs against `develop`:
`github-actions` (monthly) and `composer` (weekly, root `composer.json`).

Neither deploy/provision pipeline above runs on `pull_request` — both trigger on push/manual
dispatch only. There is a separate, lightweight `validate-pr.yml` workflow that does: it runs
`composer validate` on any PR (against `develop` or `main`) that touches `composer.json` or
`composer.lock`, catching schema errors and a `composer.json`/`composer.lock` gone out of sync.
It's deliberately secret-free — no `COMPOSER_AUTH` — so it works the same for a Dependabot PR,
which can't access ordinary Actions secrets anyway. It only checks internal consistency, not that
the licensed modules actually resolve, so it passes with or without a license configured. Beyond
that one check, review the diff yourself before merging any PR — a bad bump still only surfaces
for real after merging into `develop` triggers the dev deploy.

For the four licensed `kit-modules` (`solidbunch/basis`, `monitoring-client`,
`monitoring-server`, `proxy`), add `DEPENDABOT_LICENSE_USERNAME` (your license email) and
`DEPENDABOT_LICENSE_PASSWORD` (your license key) under **Settings → Secrets and variables →
Dependabot**. This is a separate store from Actions secrets, which Dependabot cannot read. Without
them, updates for those four modules fail with an authentication error (see **Insights →
Dependency graph → Dependabot**) and no PR is opened; other dependencies are unaffected. You can
leave them unset until you have a paid license. For the license itself, see
[Quick start after purchase](quick-start-after-purchase.md).

`dependabot.yml` already excludes `solidbunch/starter-kit-theme` and `roave/security-advisories`,
which Dependabot cannot version-bump. No action needed.

**Docker image tags.** Dependabot does not update the `APP_*_IMAGE` tags in
`config/environment/.env.main`; bump them by hand. `APP_COMPOSER_IMAGE`, `APP_NODE_IMAGE` and
`APP_IAC_IMAGE` are also pinned in `.gitlab-ci.yml`; keep both places in sync. If a PR changes
`APP_DATABASE_IMAGE` to a different `major.minor`, the deploy stops when it recreates the
containers, until you upgrade the database — see
[Database management — Upgrading MariaDB version](database-management.md#upgrading-mariadb-version).

---

## GitLab CI/CD

An independent pipeline for plain GitLab.com shared runners (no self-hosted runner needed). It
**deploys** — dev on push to `develop`, prod via a manual pipeline run on `main` — and it can also
**provision** servers (Terraform + Ansible), selected with the `PIPELINE_KIND` input of a manual
pipeline run (Step 3, optional). Provisioning needs GitLab 18.1 or newer, which introduced pipeline
inputs. Environment names match GitHub exactly: `dev` and `prod`.

### Step 1 — add CI/CD variables

> ⚠️ **Protect `develop` first:** the variables below are marked `Protected`, which means GitLab
> withholds them from any pipeline whose branch isn't a **protected branch**. GitLab only
> auto-protects the repository's default branch (typically `main`) — `develop` is not protected
> by default. Go to **Settings → Repository → Protected branches** and protect `develop` too,
> or the dev pipeline (which runs on every push to `develop`) silently runs without `SSH_KEY` /
> `SSH_CONFIG` / `COMPOSER_AUTH` and fails.

Go to **Settings → CI/CD → Variables** and add:

| Variable             | Type     | Protected | Environment scope | Notes                                                                                                                                                                                                    |
| -------------------- | -------- | --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SSH_KEY`            | File     | yes       | `All` (default)   | Private deploy key. One pair covers both dev and prod unless they need different keys — see note below.                                                                                                  |
| `SSH_CONFIG`         | File     | yes       | `All` (default)   | SSH client config — must define a `Host` block for **each** environment's `APP_DOMAIN` (see the GitHub example above; same file works for both since `Host` blocks are name-matched, not scope-matched)  |
| `COMPOSER_AUTH`      | Variable | yes       | `All`             | Same Composer auth JSON as the GitHub setup, unescaped                                                                                                                                                   |
| `APP_MULTI_INSTANCE` | Variable | no        | `dev`             | Optional. Only add this row if you want the multi-instance (Traefik) deploy on the **dev** server; see [Infrastructure → Reverse proxy (multi-instance)](infrastructure.md#reverse-proxy-multi-instance) |
| `APP_MULTI_INSTANCE` | Variable | no        | `prod`            | Optional. Same, for the **prod** server — a separate row, since scoping this one to `All` would turn it on for both at once                                                                              |

`SSH_KEY`/`SSH_CONFIG` don't need per-environment scoping unless dev and prod actually use
different keys — the deploy job always reads plain `$SSH_KEY`/`$SSH_CONFIG`, so a single `All`-scoped
pair is enough for most setups. Only add a `dev`- or `prod`-scoped override (same variable name) if
that environment needs a different key/config; GitLab resolves the most specific matching scope.

`APP_MULTI_INSTANCE` is read the same plain `$APP_MULTI_INSTANCE` way, which is why it is shown
above as two separate rows rather than one `All`-scoped row: leave out whichever environment you
don't want it on. GitLab's "Environment scope" is just a name match on the variable itself, so there
is nothing to create first.

There is no deploy-target variable here either — see "Know how the deploy target is resolved"
above; the same `APP_DOMAIN` derivation applies on GitLab.

> Optional, recommended for `prod`: **Settings → CI/CD → Protected environments** → protect
> `prod` to restrict who can trigger a prod release.

### Step 2 — run it

Do this once the servers exist. If you still need to create them, do Step 3 first.

- **Dev**: just push to `develop` — the pipeline runs automatically.
- **Prod**: go to **CI/CD → Pipelines → Run pipeline**, set the ref to `main`. This is the
  GitLab equivalent of GitHub's manual `workflow_dispatch` — a plain `git push` to `main` does
  **not** trigger a pipeline.
- Any other branch produces no pipeline at all — that's expected, not a misconfiguration.

Check pipeline logs under **CI/CD → Pipelines** after any run.

### Step 3 — optional: provision servers

Skip this step if your servers already exist. Otherwise, do the parts in order.

**1. Configure the project.** Set the `GITLAB_*` values in `config/environment/.env.main` (see
"Before you start").

**2. Create the AWS identity provider and the two IAM roles.** Run this from the project root after
`make env <env>` (it needs neither the AWS CLI nor credentials; in a terminal it pauses after each
part, so do that part and press Enter):

```bash
make oidc dev gen gitlab
```

It prints three parts, labelled STEP 0, 1 and 2, with the AWS Console path for every action:

- **STEP 0 — identity provider** (once per AWS account): the provider URL is your `GITLAB_HOST`,
  the audience is `sts.amazonaws.com`.
- **STEP 1 — everyday provisioning role** (`GITLAB_ROLE_NAME`): create the role, replace its trust
  policy with the printed one (it trusts only the branches in `GITLAB_PROVISION_BRANCHES`), then
  create and attach the printed permissions policy.
- **STEP 2 — bootstrap role** (`GITLAB_BOOTSTRAP_ROLE_NAME`): the same actions, with a trust policy
  limited to `main` and a permissions policy that only creates and configures the state bucket.

Each role's printed ARN has an `<ACCOUNT_ID>` placeholder: replace it with your 12-digit AWS
account ID. To verify the result later, run `make oidc dev test gitlab` (needs the AWS CLI and
credentials that can read IAM).

**3. Add the variables** in **Settings → CI/CD → Variables**:

| Variable                       | Required? | Environment scope | Notes                                                                                                                                  |
| ------------------------------ | --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_ROLE_TO_ASSUME`           | yes       | `All` (default)   | Everyday role ARN. Use one row per environment (`dev`, `prod`) only if an environment uses a different AWS account                     |
| `AWS_BOOTSTRAP_ROLE_TO_ASSUME` | yes       | `All` (default)   | Bootstrap role ARN. Do not scope it to an environment                                                                                  |
| `TFPLAN_PASSPHRASE`            | no        | `All`             | Passphrase that encrypts saved Terraform plans and the state backup taken before a destroy. Without it you get a warning, not a failure |
| `PLAN_ARTIFACT_TOKEN`          | no        | `All`             | Project access token. Set it only if the pipeline cannot download a saved plan from an earlier job with its own job token              |

**4. Create the Terraform state bucket** (once per AWS account): **CI/CD → Pipelines → Run
pipeline**, branch `main`, `PIPELINE_KIND` = `bootstrap-state`, `CONFIRM` = the AWS region exactly
as set in `TF_VAR_aws_region` in `config/environment/.env.main`.

**5. Provision.** **CI/CD → Pipelines → Run pipeline**, on a branch listed in
`GITLAB_PROVISION_BRANCHES`, with these inputs:

| Input              | Value                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| `PIPELINE_KIND`    | `provision`                                                                        |
| `ENVIRONMENT_TYPE` | `dev` or `prod` (`stage` is rejected: it has no Ansible host)                      |
| `ACTION_TYPE`      | `plan` (preview only — always run this first), `apply`, or `destroy`               |
| `SKIP_ANSIBLE`     | leave unchecked unless you want Terraform only                                     |
| `PLAN_JOB_ID`      | optional: the GitLab job ID of an earlier `plan` run, to apply exactly that plan   |
| `CONFIRM_DESTROY`  | for `destroy` only: the same value as `ENVIRONMENT_TYPE`                           |

**6. Prevent overlapping runs.** Do this once per environment, after its first provisioning run.
Without it, two provisioning runs of the same environment can overlap. GitLab runs an
environment's jobs one at a time through a *resource group* named `provision-<env>`; set that group
to oldest-first order with the GitLab API (`<env>` is `dev` or `prod`):

```bash
curl --request PUT --header "PRIVATE-TOKEN: <your-access-token>" \
  --header "Content-Type: application/json" --data '{"process_mode": "oldest_first"}' \
  "https://<your-gitlab-host>/api/v4/projects/<project-id>/resource_groups/provision-<env>"
```

`<your-access-token>` is a personal or project access token with the `api` scope; `<project-id>` is
shown under **Settings → General**. A 404 means that environment has not run yet: run it once, then
retry.
