# CI/CD Deployments

Two ready-to-use pipelines ship with the project: GitHub Actions (`.github/workflows/`) and
GitLab CI/CD (`.gitlab-ci.yml` + `.gitlab/ci/`). Both deploy the same way — build, then `rsync`
the code to the server and run a `make` sequence over SSH — and both need a one-time setup on
the Git hosting side before the first pipeline run will work. Pick whichever hosting you use;
they don't depend on each other and can coexist.

## Before you start (both pipelines)

1. **Generate a deploy SSH key pair** (e.g. `ssh-keygen -t ed25519 -f deploy_key -N ""`) —
   dedicated to server access, not your personal key.

2. **Add the private half as the `SSH_KEY` secret/variable** (see the setup steps below) —
   do this *before* provisioning, since provisioning derives the public key from this secret and
   bakes it into the new server automatically. You never manually touch `~/.ssh/authorized_keys`.

3. **Provision the server(s)** — creates the server (Terraform) and installs required software
   (Ansible) using the key from step 2:
   
   - Preferred: run `job-provision.yml` from the **Actions** tab with `ACTION_TYPE: apply` (see
     GitHub Actions setup below) — this is a GitHub Actions workflow, there is no GitLab
     equivalent.
   
   - Manual/local alternative, in this exact order (later layers depend on the earlier ones):
     
     ```bash
     make tf state apply
     make tf shared apply
     make tf dev apply      # or: make tf prod apply
     make ansible dev inventory && make ansible dev playbook   # or: prod
     ```

4. If you already have server(s) set up outside this project's Terraform/Ansible, just make sure
   the public half of the same deploy key pair is on the server (e.g. in
   `~/.ssh/authorized_keys` for the deploy user) and the required software is installed.

---

## GitHub Actions

Workflow files in `.github/workflows/`:

| File                             | Trigger                             | What it does                                                                 |
| -------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `workflow-deploy-develop.yml`    | push to `develop` branch, or manual | deploys to **dev** (`develop.starter-kit.io`)                                |
| `workflow-deploy-production.yml` | manual only                         | deploys to **prod** (`starter-kit.io`) — no auto-deploy on push              |
| `job-provision.yml`              | manual only                         | provisions infrastructure (Terraform + Ansible) for `dev` / `stage` / `prod` |

### Step 1 — create the GitHub Environments

Both the deploy and the provisioning workflow read their secrets/variables from a **GitHub
Environment** matching the target: `dev`, `stage`, or `prod`. If the environment doesn't exist
yet, GitHub silently creates an empty one on first run and none of your configured
secrets/variables apply — so create them up front:

1. Go to the repo → **Settings → Environments → New environment**.
2. Create three environments, named **exactly**: `dev`, `stage`, `prod`.
3. (Optional but recommended for `prod`) Open the environment → add **required reviewers** and/or
   a **wait timer** under protection rules. This now gates both the deploy and the provisioning
   pipeline for that environment.

> Environments with their own secrets/variables work on a public repo on any GitHub plan. On a
> **private** repo you need GitHub Pro, Team, or Enterprise.

### Step 2 — add the required secrets

Go to **Settings → Secrets and variables → Actions → Secrets** and add:

| Secret              | Required? | Used by            | What it is                                                                                                                                 |
| ------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SSH_KEY`           | **yes**   | deploy + provision | Private key from the deploy pair (server access)                                                                                           |
| `SSH_CONFIG`        | **yes**   | deploy + provision | SSH client config for the servers — see example below. Host-key trust comes entirely from this file, no separate known-hosts secret needed |
| `COMPOSER_AUTH`     | **yes**   | deploy + provision | Unlocks licensed Composer packages (kit modules)                                                                                           |
| `TFPLAN_PASSPHRASE` | no        | provision only     | Enables encrypted Terraform plan review — see Step 4                                                                                       |
| `GITHUB_TOKEN`      | —         | —                  | Provided automatically by GitHub, nothing to set up                                                                                        |

`SSH_CONFIG` example (add both the `develop` and prod host aliases used above):

```conf
# SSH_CONFIG
Host *
   IdentitiesOnly yes
   StrictHostKeyChecking no

# Develop server ssh alias
Host develop.starter-kit.io
  HostName 00.00.00.00
  User serverusername
  Port 22

# Prod server ssh alias
Host starter-kit.io
  HostName 00.00.00.00
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

### Step 3 — add the required variables

Go to **Settings → Secrets and variables → Actions → Variables** (repo-level), or into a
specific environment's own **Variables** section (environment-level):

| Variable             | Level                                                                              | Required?        | What it does                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_ROLE_TO_ASSUME` | repo                                                                               | for provisioning | ARN of the IAM role GitHub OIDC assumes to run Terraform/Ansible — there are no static AWS keys anywhere. Run `bash ./kit-modules/basis/sh/oidc.sh -m gen -e dev` for step-by-step instructions to create this role |
| `APP_MULTI_INSTANCE` | **environment** (set inside each `dev`/`stage`/`prod` environment, not repo-level) | no               | Set to `1` to enable the multi-instance (Traefik) deploy on that specific server. Setting it repo-level would turn it on for prod too                                                                               |

There's no AWS region variable to set — it's read automatically from
`config/environment/.env.main`.

### Step 4 — cloud side: set up OIDC so GitHub can assume the Terraform role

Provisioning never uses long-lived cloud access keys stored as secrets. It authenticates via
**OpenID Connect (OIDC)**: GitHub Actions presents a short-lived, workflow-scoped identity token
to the cloud provider, the provider checks it against a trust policy scoped to your GitHub
org/repo, and hands back temporary credentials for that run only. This is the standard,
provider-agnostic pattern — the concept and setup shape are the same everywhere:

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
your project:

```bash
bash ./kit-modules/basis/sh/oidc.sh -m gen -e dev
```

(Requires the AWS CLI installed locally and configured with credentials that can create IAM
resources.) It prints:

1. **IAM → Identity providers → Add provider** — Provider type `OpenID Connect`, Provider URL
   `token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`.
2. **IAM → Roles → Create role → Web identity** — Identity provider
   `token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`, GitHub
   organization/repository set to your repo (from `GITHUB_ORG`/`GITHUB_REPO` in
   `config/environment/.env.main`, e.g. `solidbunch/starter-kit-foundation`). AWS generates the
   trust policy automatically from this.
3. A **permissions policy JSON** to paste into **IAM → Policies → Create policy → JSON**, scoped
   to exactly what Terraform needs: read/write on the state S3 bucket
   (`TF_VAR_tf_backend_bucket`), read/write on the DynamoDB lock table (`TF_VAR_tf_lock_table`),
   and `ec2:*`. Attach it to the role created in step 2.
4. The role name defaults to `ROLE_NAME` from `.env.main` (`github-actions-role`) — the resulting
   role ARN (`arn:aws:iam::<account-id>:role/github-actions-role`) is what you paste into the
   `AWS_ROLE_TO_ASSUME` GitHub variable from Step 3.

To double-check an existing setup instead of generating a new one (verifies the OIDC provider,
role, trust-policy scoping, and attached policy content against your real AWS account):

```bash
bash ./kit-modules/basis/sh/oidc.sh -m test -e dev
```

Run this once per AWS account you deploy to — the same role/provider can be reused across `dev`,
`stage`, and `prod` if they share an account, since scoping is by GitHub org/repo, not by
environment.

### Step 5 — optional: reviewed Terraform plans

If you add the optional `TFPLAN_PASSPHRASE` secret, the provisioning workflow gets a
"plan → review → apply" safety flow instead of always re-planning right before applying:

1. Run the workflow with `ACTION_TYPE: plan`. The plan is encrypted and attached to that run as
   an artifact.
2. Review the plan output in the run logs.
3. Run the workflow again with `ACTION_TYPE: apply` and `PLAN_RUN_ID` set to the plan run's ID —
   it applies exactly the reviewed plan instead of generating a new one.

If `TFPLAN_PASSPHRASE` isn't set, this is skipped automatically (a warning is written to the run
summary) and `apply` just plans and applies in the same run — nothing breaks.

### Step 6 — run it

- **Dev**: push to `develop`, or run `workflow-deploy-develop.yml` manually from the **Actions**
  tab.
- **Prod**: run `workflow-deploy-production.yml` manually from the **Actions** tab.
- **Provisioning**: run `job-provision.yml` manually, choosing `ENVIRONMENT_TYPE` (dev/stage/prod),
  `ACTION_TYPE` (`plan` — preview only, always run this first; `apply`; or `destroy` — tears
  infrastructure down, only on purpose), and `SKIP_ANSIBLE` (leave unchecked unless you want
  Terraform-only, no server software installation).

Check the **Actions** tab for logs after any run.

---

## GitLab CI/CD

An independent pipeline for plain GitLab.com shared runners (no self-hosted runner needed),
covering **deploy only** — dev on push to `develop`, prod via a manual pipeline run on `main`.
There is no GitLab equivalent of the GitHub provisioning workflow; provision servers via GitHub
Actions or manually either way.

### Step 1 — add CI/CD variables

Go to **Settings → CI/CD → Variables** and add, scoping each to its environment via the
variable's **Environment scope** field (so the same variable name holds different dev/prod
values):

| Variable             | Type     | Protected | Environment scope | Notes                                                                                       |
| -------------------- | -------- | --------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `SSH_KEY`            | File     | yes       | `dev`             | Private deploy key for the dev server                                                       |
| `SSH_KEY`            | File     | yes       | `production`      | Private deploy key for the prod server                                                      |
| `SSH_CONFIG`         | File     | yes       | `dev`             | SSH client config for the dev server (same format as the GitHub example above)              |
| `SSH_CONFIG`         | File     | yes       | `production`      | SSH client config for the prod server                                                       |
| `COMPOSER_AUTH`      | Variable | yes       | `All`             | Same Composer auth JSON as the GitHub setup, unescaped                                      |
| `SSH_KNOWN_HOSTS`    | File     | no        | as needed         | Only needed if you'd rather manage host-key trust this way instead of inside `SSH_CONFIG`   |
| `APP_MULTI_INSTANCE` | Variable | no        | per environment   | Same meaning as on GitHub — `1` enables the multi-instance (Traefik) deploy for that server |

You'll add `SSH_KEY` and `SSH_CONFIG` twice each — once per environment scope — since GitLab
resolves the right value at run time from the job's environment, keeping the pipeline YAML free
of `_PROD`-suffixed variable names.

### Step 2 — (recommended for prod) protect the environment

**Settings → CI/CD → Protected environments** → protect `production` to restrict who can trigger
a prod release.

### Step 3 — run it

- **Dev**: just push to `develop` — the pipeline runs automatically.
- **Prod**: go to **CI/CD → Pipelines → Run pipeline**, set the ref to `main`. This is the
  GitLab equivalent of GitHub's manual `workflow_dispatch` — a plain `git push` to `main` does
  **not** trigger a pipeline.
- Any other branch produces no pipeline at all — that's expected, not a misconfiguration.

Check pipeline logs under **CI/CD → Pipelines** after any run.
