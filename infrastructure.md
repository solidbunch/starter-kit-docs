# Infrastructure

> 💰 **Kit-modules are paid add-ons.** `basis`, `monitoring-client`, `monitoring-server`, and
> `proxy` are not part of the free/default Foundation download — they're only granted by a **Pro
> tier or higher** license, purchased at [starter-kit.io](https://starter-kit.io). Without a valid
> license, `kit-modules/` stays empty and everything below doesn't apply yet. Already bought one?
> See [Quick start after purchase](quick-start-after-purchase.md) to unlock it.

Terraform and Ansible are not part of the Foundation repo itself — they ship inside
`kit-modules/basis`, a licensed sub-project that Composer installs (as its own VCS repo) once a
valid SolidBunch license is configured. It resolves alongside two other required, licensed
kit-modules — `monitoring-client` and `monitoring-server` (see [Composer usage](composer-usage.md))
— plus an opt-in `proxy` module for multi-instance reverse-proxy setups. Without a valid license,
`kit-modules/basis/` is absent (or resolves to an empty stub) and the steps below don't apply yet.

For an interactive shell inside the IaC container, already `cd`'d into `kit-modules/basis`, run:
```bash
make basis
```

### Setup infrastructure with Terraform

Terraform provisions the cloud infrastructure (VPC, EC2 instance) in three layers, applied in this
exact order — each layer reads the previous one's remote state:

1. **`state`** — bootstraps the remote-state S3 bucket and DynamoDB lock table
2. **`shared`** — creates the VPC and uploads the deploy SSH public key
3. **`dev`/`prod`** — creates that environment's EC2 instance, using the VPC/key from `shared`

```bash
make tf state apply
make tf shared apply
make tf dev apply      # or: make tf prod apply
```

> Always run `make tf [env] plan` and review the diff before `make tf [env] apply`.

Credentials and the SSH public key are supplied automatically, not placed by hand:

- **AWS credentials** are never read from `~/.aws/credentials`. Locally they come from
  `config/environment/.env.secret` and are passed into the `iac` container as env vars; in CI
  they come from a short-lived AWS OIDC role — see [CI/CD Deployments](ci-cd-deployments.md).
- **SSH public key** must exist at `kit-modules/basis/terraform/public_keys/<APP_NAME>_deploy_key.pub`
  (the filename comes from `TF_VAR_sk_ssh_key_name` in `.env.main` — not `id_rsa.pub`). In CI this
  is derived automatically from the `SSH_KEY` secret; running Terraform manually, derive it
  yourself first: `ssh-keygen -y -f <your-private-key> > kit-modules/basis/terraform/public_keys/<APP_NAME>_deploy_key.pub`.

> The GitHub provisioning workflow offers `stage` as an environment choice alongside `dev` and
> `prod`, but only `kit-modules/basis/terraform/envs/dev/`, `.../prod/`, and `.../shared/` ship
> with the project — there is no `.../stage/` directory yet. Running `make tf stage ...` (or
> triggering the workflow with `stage`) will fail until that env directory is created first,
> following the pattern of `dev/`/`prod/`.

### Automate server apps with Ansible

1. Provision the server first (`make tf [env] apply`) — Ansible connects to the instance Terraform
   just created.
2. Generate the inventory from Terraform's outputs, then run the playbook — these are two
   separate commands, in this order:
```bash
make ansible [env] inventory
make ansible [env] playbook
```
Add `static` as a third argument to `playbook` (`make ansible dev playbook static`) to use a
hand-maintained `kit-modules/basis/ansible/inventory.yml` instead of the generated one.

After that you will be able to run CI/CD deployment pipelines automations.

### Monitoring

The `monitoring-client` kit-module ships a fluent-bit pipeline that forwards container logs to a
Loki instance run by `monitoring-server`. Toggle it with:

```bash
make monitoring on
make monitoring off
```

`make mon` is a shorthand for the same target. Requires `APP_LOKI_ENABLE=1` in the environment's
env file (shipped as `1` for `dev`/`prod`, `0` for `local`) — otherwise `make monitoring on` is a
no-op.

### Reverse proxy (multi-instance)

The optional `proxy` kit-module runs a Traefik reverse proxy in front of multiple project
instances on the same host, including TLS termination when `APP_MULTI_INSTANCE=1` (see
[HTTPS & Local Certificates](https-and-local-certificates.md)). If the module isn't installed and
`APP_MULTI_INSTANCE` isn't `1`, these commands are no-ops; if `APP_MULTI_INSTANCE=1` but the
module isn't installed, they fail instead — configure a valid license and run
`composer update solidbunch/proxy`:

```bash
ACME_EMAIL=you@example.com make proxy start   # ACME_EMAIL is required, no default
make proxy stop
make proxy logs
make proxy deploy [env]
```
