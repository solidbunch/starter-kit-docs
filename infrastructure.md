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

For control your servers infrastructure use following steps:

1. Check `kit-modules/basis/terraform/envs/**/*.tf` files, update your provider and infrastructure settings
2. Add provider credentials. For example for AWS use `~/.aws/credentials` file. Add `aws_access_key_id` and `aws_secret_access_key`. [Configuration and credential file settings](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-global)
3. Add your deployment public key `id_rsa.pub` to `kit-modules/basis/terraform/public_keys/` folder
4. Run terraform [commands](https://developer.hashicorp.com/terraform/cli/commands) for an environment:
```bash
make tf [env] [command]
```

Examples:
```bash
make tf dev init
make tf dev plan
make tf dev apply
```

> Always run `make tf [env] plan` and review the diff before `make tf [env] apply`.

> The GitHub provisioning workflow offers `stage` as an environment choice alongside `dev` and
> `prod`, but only `kit-modules/basis/terraform/envs/dev/`, `.../prod/`, and `.../shared/` ship
> with the project — there is no `.../stage/` directory yet. Running `make tf stage ...` (or
> triggering the workflow with `stage`) will fail until that env directory is created first,
> following the pattern of `dev/`/`prod/`.

### Automate server apps with Ansible

For running server setup automations use this steps:

1. Add public key to `~/authorized_keys` file on servers (use `make tf [env] apply` command if you haven't already done so)
2. Check your credentials in `./.ssh` folder. Use [ssh config file](https://linuxize.com/post/using-the-ssh-config-file/) to simplify connections.
3. Check `kit-modules/basis/ansible/inventory.yml` servers and credentials, host names should be the same as on ssh config file.
4. Check `kit-modules/basis/ansible/playbook.yml` file hosts and tasks. Hosts must correspond to inventory hosts.
5. Run ansible command:
```bash
make ansible [env] playbook
```
This will run the main playbook for the given environment's inventory (generated from Terraform
outputs by default). Add `static` as a third argument (`make ansible dev playbook static`) to use
a hand-maintained `inventory.yml` instead.

After that you will be able to run CI/CD deployment pipelines automations.

### Monitoring

The `monitoring-client` kit-module ships a fluent-bit pipeline that forwards container logs to a
Loki instance run by `monitoring-server`. Toggle it with:

```bash
make monitoring on
make monitoring off
```

`make mon` is a shorthand for the same target.

### Reverse proxy (multi-instance)

The optional `proxy` kit-module runs a Traefik reverse proxy in front of multiple project
instances on the same host, including TLS termination when `APP_MULTI_INSTANCE=1` (see
[HTTPS & Local Certificates](https-and-local-certificates.md)). If the module isn't installed,
these commands are no-ops:

```bash
make proxy start
make proxy stop
make proxy logs
make proxy deploy [env]
```
