# Infrastructure

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
