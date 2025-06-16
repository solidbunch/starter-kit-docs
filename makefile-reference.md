# Makefile Reference

The **Makefile** is a slim wrapper around a collection of shell scripts and `docker compose` calls, giving you short, memorable commands for every stage of your local and remote workflow.

---

## Preamble & Variables

| Name                          | Meaning                                                                                                                      |
|-------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `CURRENT_UID` / `CURRENT_GID` | Host user and group IDs (forced to **1000** on macOS). Injected into containers so generated files retain correct ownership. |
| `PARAMS`                      | Everything you type **after** the target — `make up stage` — forwarded to the called script.                                 |
| `PARAM1…PARAM3`               | Shortcuts for the first three extra words.                                                                                   |
| `DEFAULT_USER`                | WP‑CLI user read from `.env.main`.                                                                                           |

---

## Targets

| Make Target      | Command                                               | Description                                    |
|------------------|-------------------------------------------------------|------------------------------------------------|
| **install**      | `sh/system/install.sh`                                | One‑shot install                               |
| **i**            | `make install`                                        | Alias.                                         |
| **secret**       | `sh/env/secret-gen.sh`                                | Create `.env.secret`.                          |
| **env**          | `sh/env/init.sh $(PARAMS)`                            | Re‑build the root `.env` from layered parts.   |
| **certbot**      | `sh/system/certbot.sh $(PARAMS)`                      | Obtain or renew Let’s Encrypt certificates.    |
| **ssl**          | `make certbot`                                        | Alias.                                         |
| **core-install** | `wp-cli/core-install.sh`                              | Idempotent WordPress core install.             |
| **watch**        | `sh/dev/npm-watch.sh $(PARAMS)`                       | Front‑end watch with BrowserSync.              |
| **up**           | `docker compose up -d --build`                        | Start (or rebuild) containers, detached.       |
| **upd**          | `docker compose up --build`                           | Same, foreground.                              |
| **down**         | `docker compose down -v`                              | Stop containers and drop named volumes.        |
| **restart**      | `docker compose restart`                              | Quick service restart.                         |
| **recreate**     | `docker compose up --build --force-recreate`          | Rebuild & replace every container.             |
| **import**       | `sh/database/import.sh -f $(PARAM1)`                  | Import SQL dump and fix URLs.                  |
| **export**       | `sh/database/export.sh`                               | Dump current DB to `db/backups/`.              |
| **replace**      | `wp search-replace $(PARAMS)`                         | One‑off search/replace.                        |
| **migrate**      | `sh/system/migrate.sh -s $(PARAM1) -d $(PARAM2)`      | Push/pull DB between environments.             |
| **pma**          | `docker compose run phpmyadmin`                       | Throw‑away phpMyAdmin session.                 |
| **mailhog**      | `docker compose run mailhog`                          | MailHog UI for local SMTP.                     |
| **log**          | `docker compose logs -f $(PARAMS)`                    | Tail service logs.                             |
| **run**          | `sh/dev/run.sh run $(PARAMS)`                         | Run an ad‑hoc script in PHP container.         |
| **exec**         | `sh/dev/run.sh exec $(PARAMS)`                        | Shortcut for `docker compose exec`.            |
| **lint**         | `composer lint && npm run lint`                       | PHP & JS linters inside containers.            |
| **terraform**    | `terraform -chdir=iac/terraform $(PARAMS)`            | Terraform helpers.                             |
| **ansible**      | `ansible-playbook iac/ansible/playbook.yml $(PARAMS)` | Provision or deploy with Ansible.              |
| **docker**       | `sh/system/docker.sh $(PARAMS)`                       | Build, push, clean project images.             |

---

## UID/GID Handling

`CURRENT_UID` and `CURRENT_GID` are exported to every container so that WordPress, npm and composer outputs stay writable from the host. On macOS these values are forced to **1000** to match Docker’s default user.


