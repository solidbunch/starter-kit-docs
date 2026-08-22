# CI/CD Deployments

Two ready-to-use pipelines ship with the project: GitHub Actions (`.github/workflows/`) and
GitLab CI/CD (`.gitlab-ci.yml` + `.gitlab/ci/`). Both deploy the same way — build, then `rsync`
the code to the server and run a `make` sequence over SSH — and both need a one-time setup on
the Git hosting side before the first pipeline run will work. Pick whichever hosting you use;
they don't depend on each other and can coexist. Only GitHub Actions can also **provision**
servers (Terraform + Ansible); GitLab CI/CD is deploy-only.

> If this project was set up with the `bootstrap-project` Claude Code skill, most of "Before you
> start" below may already be done — check whether the project's own `README.md` has a "CI/CD
> setup" section filled in with real values before editing anything by hand.

## Before you start (both pipelines)

### 1. Set your project's identity in `.env.main`

`config/environment/.env.main` ships with SolidBunch's own values for a setting that only
matters for GitHub provisioning (step 3 below) — change it before provisioning:

| Field(s) to edit            | Shipped with (demo values)             | Needed for                                                     |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `GITHUB_ORG`, `GITHUB_REPO` | `solidbunch`, `starter-kit-foundation` | GitHub provisioning only (AWS OIDC trust policy, step 3 below) |

`GITHUB_REPO`/`GITHUB_ORG` must match the actual GitHub org/repo this code lives in — they're
baked into the AWS IAM trust policy in step 3, which only lets *that* repo's workflows assume the
role.

`TF_VAR_tf_backend_bucket` and `TF_VAR_tf_lock_table` (Terraform remote state) need **no manual
edit** — `TF_VAR_tf_backend_bucket=${APP_NAME}-terraform-state-storage` already derives from
`APP_NAME`, so it's unique per project the moment `APP_NAME` is (already required, since every
project renames it). `TF_VAR_tf_lock_table` stays the shared default `terraform-locks` — it only
needs to be unique within your own AWS account, not globally, so there's nothing to change there
either.

### 2. Know how the deploy target is resolved

Neither pipeline needs a deploy-target file edit or a CI/CD variable. At deploy time, the job
reads `APP_DOMAIN` straight out of `config/environment/.env.type.dev` (or `.env.type.prod`) —
already tracked in git, already set correctly if the project was renamed via `bootstrap-project` —
and uses it as both the SSH destination and the deploy path (`/srv/$APP_DOMAIN`):

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

`config/environment/.env.type.stage` already ships with the project, with its own `APP_DOMAIN` —
`stage` just has no deploy trigger yet (no `workflow-deploy-stage.yml` / GitLab equivalent). The
moment one exists, the same `APP_DOMAIN` derivation resolves a stage target for free, no other
setup needed.

### 3. Generate a deploy SSH key pair

```bash
ssh-keygen -t ed25519 -f deploy_key -N ""
```

Dedicated to server access, not your personal key. The private half becomes the `SSH_KEY`
secret (set up below, per pipeline). The public half either gets baked automatically into a
newly-provisioned server (GitHub provisioning derives it from the same `SSH_KEY` secret — you
never manually touch `~/.ssh/authorized_keys`), or, if you're pointing at a server you already
have, you add it there yourself — see "Provision the server(s)" below.

Now continue with whichever pipeline(s) you use.

---

## GitHub Actions

Workflow files in `.github/workflows/`:

| File                             | Trigger                             | What it does                                                                                      |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `workflow-deploy-develop.yml`    | push to `develop` branch, or manual | deploys to **dev** (host derived from `APP_DOMAIN` in `.env.type.dev`)                            |
| `workflow-deploy-production.yml` | manual only                         | deploys to **prod** (host derived from `APP_DOMAIN` in `.env.type.prod`) — no auto-deploy on push |
| `job-provision.yml`              | manual only                         | provisions infrastructure (Terraform + Ansible) for `dev` / `stage` / `prod`                      |

Steps 1–6 below are the minimum to get both pipelines running — none of them require creating
anything under **Settings → Environments** first. GitHub creates `dev`/`stage`/`prod`
automatically, empty, the first time a workflow references one, and every secret/variable used
below (all repo-level) still applies regardless. Follow Steps 1–6 in order — later ones depend on
earlier ones (the AWS role in step 3 needs the `AWS_ROLE_TO_ASSUME` variable slot created in
step 2; provisioning in step 4 needs that role to exist). Step 7 is optional and can be done any
time, including never — see it for the two cases where creating an Environment by hand actually
matters.

### Step 1 — add the required secrets

Go to **Settings → Secrets and variables → Actions → Secrets** and add:

| Secret              | Required? | Used by            | What it is                                                                                                                                 |
| ------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SSH_KEY`           | **yes**   | deploy + provision | Private key from the deploy pair generated above (server access)                                                                           |
| `SSH_CONFIG`        | **yes**   | deploy + provision | SSH client config for the servers — see example below. Host-key trust comes entirely from this file, no separate known-hosts secret needed |
| `COMPOSER_AUTH`     | **yes**   | deploy + provision | Unlocks licensed Composer packages (kit modules)                                                                                           |
| `TFPLAN_PASSPHRASE` | no        | provision only     | Enables encrypted Terraform plan review — see Step 5                                                                                       |

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

### Step 2 — add the required variables

Go to **Settings → Secrets and variables → Actions → Variables** (repo-level):

| Variable             | Level | Required? | Used by        | What it does                                                                                                                                                            |
| -------------------- | ----- | --------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_ROLE_TO_ASSUME` | repo  | no        | provision only | ARN of the IAM role GitHub OIDC assumes to run Terraform/Ansible. **Leave this unset for now** — step 3 below generates the role and gives you the ARN to paste in here |

There's no deploy-target variable to set here — see "Know how the deploy target is resolved"
above. There's no AWS region variable either — it's read automatically from
`config/environment/.env.main`.

`APP_MULTI_INSTANCE` is optional and only useful once a GitHub Environment exists to scope it to
— see Step 7.

### Step 3 — cloud side: create the AWS role GitHub will assume

Provisioning never uses long-lived cloud access keys stored as secrets. It authenticates via
**OpenID Connect (OIDC)**: GitHub Actions presents a short-lived, workflow-scoped identity token
to the cloud provider, the provider checks it against a trust policy scoped to your GitHub
org/repo (the `GITHUB_ORG`/`GITHUB_REPO` values you set in "Before you start"), and hands back
temporary credentials for that run only. This is the standard, provider-agnostic pattern — the
concept and setup shape are the same everywhere:

1. Register GitHub's OIDC issuer (`token.actions.githubusercontent.com`) as a trusted identity
   provider in the cloud account.
2. Create a role/service-account scoped to your repo (and optionally branch/environment) that
   this identity provider is allowed to assume.
3. Attach only the permissions Terraform/Ansible actually need to that role — no standing keys.
4. Put the resulting role identifier into CI as a variable (not a secret — it's not sensitive on
   its own).

Every major cloud supports this: AWS via an **IAM OIDC identity provider + IAM role**, GCP via
**Workload Identity Federation**, Azure via **federated credentials on an App Registration/Managed
Identity**. This project's shipped Terraform/Ansible code targets **AWS** specifically, so the
rest of this step is AWS-flavored — swap in your provider's equivalent if you've adapted the
infrastructure code elsewhere.

The project ships a helper that prints the exact AWS console steps and a ready-to-paste policy for
your project (using your project's bucket/table names — see "Before you start" — and the GitHub
org/repo you set there):

```bash
bash ./kit-modules/basis/sh/oidc.sh -m gen -e dev
```

(Requires the AWS CLI installed locally and configured with credentials that can create IAM
resources.) It walks you through three console steps, printing the exact values for each:

1. **IAM → Identity providers → Add provider** — Provider type `OpenID Connect`, Provider URL
   `token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`.
2. **IAM → Roles → Create role → Web identity** — Identity provider
   `token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`, GitHub
   organization/repository set to your repo (from `GITHUB_ORG`/`GITHUB_REPO` in
   `config/environment/.env.main`). AWS generates the trust policy automatically from this.
3. **IAM → Policies → Create policy → JSON**, using the printed **permissions policy JSON** —
   scoped to exactly what Terraform needs: read/write on the state S3 bucket
   (`TF_VAR_tf_backend_bucket`), read/write on the DynamoDB lock table (`TF_VAR_tf_lock_table`),
   and `ec2:*`. Then attach that policy to the role created in step 2 (**IAM → Roles →
   `${ROLE_NAME}` → Permissions → Attach policies** — also printed by the script).

None of this prints the role's ARN — the script only prints the three steps above. The role name
is `ROLE_NAME` from `.env.main` (`github-actions-role`, safe to leave as-is — it only needs to be
unique within your own AWS account), so once the role exists you construct the ARN yourself:
`arn:aws:iam::<your-account-id>:role/github-actions-role` (find `<your-account-id>` on the role's
own summary page in the IAM console).

**Go back to step 2 now and fill in `AWS_ROLE_TO_ASSUME` with that ARN.**

To double-check an existing setup instead of generating a new one (verifies the OIDC provider,
role, trust-policy scoping, and attached policy content against your real AWS account):

```bash
bash ./kit-modules/basis/sh/oidc.sh -m test -e dev
```

Run this once per AWS account you deploy to — the same role/provider can be reused across `dev`,
`stage`, and `prod` if they share an account, since scoping is by GitHub org/repo, not by
environment.

### Step 4 — provision the server(s)

Creates the server (Terraform) and installs required software (Ansible), using the SSH key from
step 1 and the AWS role from step 3:

- **Preferred:** repo → **Actions** tab → *Provision Infrastructure* in the left sidebar →
  **Run workflow**, choosing:
  
  - `ENVIRONMENT_TYPE`: `dev`, `stage`, or `prod` — only `dev` and `prod` ship with a Terraform
    environment directory (`kit-modules/basis/terraform/envs/{dev,prod}/`); choosing `stage` fails
    until you create `.../envs/stage/` yourself, following the same pattern
  - `ACTION_TYPE`: `plan` (preview only — always run this first), `apply`, or `destroy` (tears
    infrastructure down, only on purpose)
  - `SKIP_ANSIBLE`: leave unchecked unless you specifically want Terraform-only (no server
    software installed)

- **Manual/local alternative**, in this exact order (later layers depend on the earlier ones):
  
  ```bash
  make tf state apply
  make tf shared apply
  make tf dev apply      # or: make tf prod apply
  make ansible dev inventory && make ansible dev playbook   # or: prod
  ```

- **Already have a server?** If you're pointing at server(s) set up outside this project's
  Terraform/Ansible, skip this step entirely — just make sure the public half of the deploy key
  pair from step 1 is on the server (e.g. in `~/.ssh/authorized_keys` for the deploy user) and the
  required software is installed.

Check the **Actions** tab for logs after any run.

### Step 5 — optional: reviewed Terraform plans

If you add the optional `TFPLAN_PASSPHRASE` secret (step 1), the provisioning workflow gets a
"plan → review → apply" safety flow instead of always re-planning right before applying:

1. Run the workflow with `ACTION_TYPE: plan`. The plan is encrypted and attached to that run as
   an artifact.
2. Review the plan output in the run logs.
3. Run the workflow again with `ACTION_TYPE: apply` and `PLAN_RUN_ID` set to the plan run's ID —
   it applies exactly the reviewed plan instead of generating a new one.

If `TFPLAN_PASSPHRASE` isn't set, this is skipped automatically (a warning is written to the run
summary) and `apply` just plans and applies in the same run — nothing breaks.

### Step 6 — deploy

- **Dev**: push to `develop`, or run `workflow-deploy-develop.yml` manually from the **Actions**
  tab.
- **Prod**: run `workflow-deploy-production.yml` manually from the **Actions** tab.

Check the **Actions** tab for logs after any run.

### Step 7 — optional: GitHub Environments

Nothing above requires creating anything under **Settings → Environments**. If `dev`/`stage`/
`prod` don't exist yet, GitHub creates them automatically, empty, the first time a workflow
references one, and every secret/variable from Steps 1–2 (all repo-level) still applies. Create
one by hand only if you want either of these:

- **Gate deploys/provisioning** (optional, recommended for `prod`): **Settings → Environments →
  New environment**, named exactly `dev`/`stage`/`prod` → open it → add **required reviewers**
  and/or a **wait timer** under protection rules. This gates both the deploy and the provisioning
  pipeline for that environment.
- **Scope `APP_MULTI_INSTANCE` per server**: this variable can only differ between `dev` and
  `prod` if it's set at the environment level, inside that environment's own **Variables**
  section — setting it repo-level would turn it on for prod too. That's *why* this needs an
  actual Environment object to exist first on GitHub: an environment-scoped variable/secret is
  physically attached to that object. GitLab has no equivalent prerequisite for the same thing —
  see "GitLab CI/CD" below, where its "Environment scope" is just a name match on the variable
  itself, nothing to create beforehand. See
  [Infrastructure → Reverse proxy (multi-instance)](infrastructure.md#reverse-proxy-multi-instance)
  for what `APP_MULTI_INSTANCE` actually does.
- **Different `SSH_KEY`/`SSH_CONFIG`/`COMPOSER_AUTH` per environment** (rare — most projects use
  the same deploy key and Composer auth everywhere): same mechanism as above. Add an
  environment-scoped secret with the same name inside that environment's own **Secrets**
  section; it overrides the repo-level one for runs pinned to that environment. GitLab's
  equivalent (a `dev`- or `prod`-scoped variable of the same name) is documented under "GitLab
  CI/CD" below and needs no Environment object either.

> Environments with their own secrets/variables work on a public repo on any GitHub plan. On a
> **private** repo you need GitHub Pro, Team, or Enterprise.

---

## GitLab CI/CD

An independent pipeline for plain GitLab.com shared runners (no self-hosted runner needed),
covering **deploy only** — dev on push to `develop`, prod via a manual pipeline run on `main`.
There is no GitLab equivalent of the GitHub provisioning workflow; provision servers via GitHub
Actions (see Step 4 above — this works even if you deploy exclusively through GitLab, as long as
the code is also mirrored to a GitHub repo) or manually. Environment names match GitHub exactly:
`dev` and `prod`.

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

`APP_MULTI_INSTANCE` is read the same plain `$APP_MULTI_INSTANCE` way, which is why it's shown
above as two separate rows rather than one `All`-scoped row: leave out whichever environment you
don't want it on. Unlike GitHub (see "GitHub Actions" above), there's no prerequisite object to
create first — GitLab's "Environment scope" is just a name match evaluated on the variable
itself at run time, so both rows can be added directly here, in this same step.

There's no deploy-target variable here either — see "Know how the deploy target is resolved"
above; the same `APP_DOMAIN`-derivation applies on GitLab. One visible side effect: the GitLab
Environments page shows no "View deployment" link for `dev`/`prod` — that's expected, not a
misconfiguration.

> Optional, recommended for `prod`: **Settings → CI/CD → Protected environments** → protect
> `prod` to restrict who can trigger a prod release.

### Step 2 — run it

- **Dev**: just push to `develop` — the pipeline runs automatically.
- **Prod**: go to **CI/CD → Pipelines → Run pipeline**, set the ref to `main`. This is the
  GitLab equivalent of GitHub's manual `workflow_dispatch` — a plain `git push` to `main` does
  **not** trigger a pipeline.
- Any other branch produces no pipeline at all — that's expected, not a misconfiguration.

Check pipeline logs under **CI/CD → Pipelines** after any run.
