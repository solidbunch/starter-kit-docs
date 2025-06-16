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

| Make Target      | Usage                                      | Command                                               | Description                             |
|------------------|--------------------------------------------|-------------------------------------------------------|-----------------------------------------|
| **install**      | `make install [environment_type]`          | `sh/system/install.sh`                                | One‑shot install                        |
| **i**            | `make i`                                   | `make install`                                        | Alias                                   |
| **secret**       | `make secret`                              | `sh/env/secret-gen.sh`                                | Create `.env.secret`                    |
| **env**          | `make env [environment_type]`              | `sh/env/init.sh $(PARAMS)`                            | Re‑build the root `.env` from parts     |
| **certbot**      | `make certbot`                             | `sh/system/certbot.sh $(PARAMS)`                      | Obtain or renew SSL certificates        |
| **ssl**          | `make ssl`                                 | `make certbot`                                        | Alias                                   |
| **core-install** | `make core-install`                        | `wp-cli/core-install.sh`                              | Idempotent WordPress core install       |
| **watch**        | `make watch`                               | `sh/dev/npm-watch.sh $(PARAMS)`                       | Front‑end watch with BrowserSync        |
| **up**           | `make up [environment_type]`               | `docker compose up -d --build`                        | Start (or rebuild) containers, detached |
| **upd**          | `make upd [environment_type]`              | `docker compose up --build`                           | Same, foreground                        |
| **down**         | `make down`                                | `docker compose down -v`                              | Stop containers and drop named volumes  |
| **restart**      | `make restart [environment_type]`          | `docker compose restart`                              | Quick service restart                   |
| **recreate**     | `make recreate [environment_type]`         | `docker compose up --build --force-recreate`          | Rebuild & replace every container       |
| **import**       | `make import <file.sql>`                   | `sh/database/import.sh -f $(PARAM1)`                  | Import SQL dump and fix URLs            |
| **export**       | `make export`                              | `sh/database/export.sh`                               | Dump current DB to `db/backups/`        |
| **replace**      | `make replace [search] [replace]`          | `wp search-replace $(PARAMS)`                         | Database search/replace                 |
| **migrate**      | `make migrate <source> <dest>`             | `sh/system/migrate.sh -s $(PARAM1) -d $(PARAM2)`      | Push/pull DB between environments       |
| **pma**          | `make pma`                                 | `docker compose run phpmyadmin`                       | Throw‑away phpMyAdmin session           |
| **mailhog**      | `make mailhog`                             | `docker compose run mailhog`                          | MailHog UI for local SMTP               |
| **log**          | `make log [service]`                       | `docker compose logs -f $(PARAMS)`                    | Tail service logs                       |
| **run**          | `make run <service>`                       | `sh/dev/run.sh run $(PARAMS)`                         | Starts a one-off container with shell   |
| **exec**         | `make exec <service>`                      | `sh/dev/run.sh exec $(PARAMS)`                        | Opens a shell in running container      |
| **lint**         | `make lint`                                | `composer lint && npm run lint`                       | PHP & JS linters inside containers      |
| **terraform**    | `make terraform <command>`                 | `terraform -chdir=iac/terraform $(PARAMS)`            | Terraform helpers                       |
| **ansible**      | `make ansible <command>`                   | `ansible-playbook iac/ansible/playbook.yml $(PARAMS)` | Provision or deploy with Ansible        |
| **docker**       | `make docker build\|push\|clean [service]` | `sh/system/docker.sh $(PARAMS)`                       | Build, push, clean project images       |

---

## UID/GID Handling

`CURRENT_UID` and `CURRENT_GID` are exported to every container so that WordPress, npm and composer outputs stay writable from the host. On macOS these values are forced to **1000** to match Docker’s default user.


