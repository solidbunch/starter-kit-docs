# Infrastructure

### Setup infrastructure with Terraform

For control your servers infrastructure use following steps:

1. Check `./iac/terraform/*.tf` files, update your provider and infrastructure settings
2. Add provider credentials. For example for AWS use `~/.aws/credentials` file. Add `aws_access_key_id` and `aws_secret_access_key`. [Configuration and credential file settings](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-global)
3. Add your deployment public key `id_rsa.pub` to `./iac/terraform/public_keys/` folder
4. Run terraform [commands](https://developer.hashicorp.com/terraform/cli/commands):
```bash
make terraform [command]
```

Examples:
```bash
make terraform init
make terraform plan
make terraform apply
```

### Automate server apps with Ansible

For running server setup automations use this steps:

1. Add public key to `~/authorized_keys` file on servers (use `make terraform apply` command if you haven't already done so)
2. Check your credentials in `./.ssh` folder. Use [ssh config file](https://linuxize.com/post/using-the-ssh-config-file/) to simplify connections.
3. Check `./iac/ansible/inventory.yml` servers and credentials, host names should be the same as on ssh config file.
4. Check `./iac/ansible/playbook.yml` file hosts and tasks. Hosts must correspond to inventory hosts.
5. Run ansible command:
```bash
make ansible
```
This will run main playbook `ansible-playbook -i iac/ansible/inventory.yml iac/ansible/playbook.yml` for all hosts.

To run playbook for specific host use command:
```bash
make ansible -- --limit [host]
```
After that you will be able to run CI/CD deployment pipelines automations.
