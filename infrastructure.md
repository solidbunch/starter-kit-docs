# Infrastructure

> 💰 **Paid add-ons.** The modules `basis`, `monitoring-client`, `monitoring-server` and `proxy`
> need a Pro or higher license from [starter-kit.io](https://starter-kit.io). Without a license,
> `kit-modules/` is empty and this page does not apply. Already purchased? See
> [Quick start after purchase](quick-start-after-purchase.md).

Terraform and Ansible ship inside the `basis` module, which Composer installs once a license is
configured (see [Composer usage](composer-usage.md)).

For an interactive shell inside the IaC container, already `cd`'d into `kit-modules/basis`, run:
```bash
make basis
```

### Setup infrastructure with Terraform

Terraform provisions the cloud infrastructure in three steps. Run them in this order, because each
step uses the result of the one before:

1. **`state`** — creates the S3 bucket that stores Terraform state (state locking is built into S3, so no lock table is needed).
2. **`shared`** — creates the network (VPC) and uploads your deploy SSH public key.
3. **`dev`** or **`prod`** — creates the server (EC2 instance) for that environment.

> Always run `make tf [env] plan` and review the diff before `make tf [env] apply`.

```bash
make tf state apply
make tf shared apply
make tf dev apply      # or: make tf prod apply
```

Before running Terraform locally, set up two things:

1. **AWS credentials.** Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (plus
   `AWS_SESSION_TOKEN` for temporary credentials) to `config/environment/.env.secret`, then run
   `make env <env>`; they are passed into the `iac` container. `~/.aws/credentials` is not read.
   CI uses a short-lived AWS OIDC role instead — see [CI/CD Deployments](ci-cd-deployments.md).
2. **Deploy public key.** Create it from your private deploy key. The file name comes from
   `TF_VAR_sk_ssh_key_name` in `.env.main` (it is not `id_rsa.pub`):

   ```bash
   ssh-keygen -y -f <your-private-key> > kit-modules/basis/terraform/public_keys/<APP_NAME>_deploy_key.pub
   ```

   CI derives this file from the `SSH_KEY` secret itself.

> The GitHub and GitLab provisioning pipelines offer `stage` as an environment choice alongside
> `dev` and `prod`, but reject it: its Terraform environment exists
> (`kit-modules/basis/terraform/envs/stage/`), but Ansible has no `stage` host in
> `kit-modules/basis/ansible/inventory.yml`, so a server would be created that Ansible cannot
> configure. Only `dev` and `prod` run end to end.

### Automate server apps with Ansible

1. Provision the server first (`make tf [env] apply`). Ansible connects to the instance Terraform
   just created.
2. Generate the inventory from Terraform's outputs:

   ```bash
   make ansible [env] inventory
   ```

3. Run the playbook:

   ```bash
   make ansible [env] playbook
   ```

To use a hand-maintained `kit-modules/basis/ansible/inventory.yml` instead, skip step 2 and run
`make ansible dev playbook static`.

After that you can run the CI/CD deployment pipelines.

### Monitoring

The `monitoring-client` module forwards container logs to a Loki log server run by
`monitoring-server`.

1. Set `APP_LOKI_ENABLE=1` in the environment's env file (shipped as `1` for `dev`/`prod`, `0` for
   `local`).
2. Turn it on or off (`make mon` works too):

   ```bash
   make monitoring on
   make monitoring off
   ```

With `APP_LOKI_ENABLE=0`, `make monitoring on` does nothing.

### Reverse proxy (multi-instance)

The optional `proxy` module runs a Traefik reverse proxy in front of several project instances on
one host. With `APP_MULTI_INSTANCE=1` it also handles HTTPS (see
[HTTPS & Local Certificates](https-and-local-certificates.md)).

- If `APP_MULTI_INSTANCE` is not `1` and the module is not installed, the commands below do nothing.
- If `APP_MULTI_INSTANCE=1` and the module is not installed, they fail. Configure a valid license
  and run `composer update solidbunch/proxy`.

```bash
ACME_EMAIL=you@example.com make proxy start   # ACME_EMAIL is required, no default
make proxy stop
make proxy logs
make proxy deploy [env]
```
