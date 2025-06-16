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

| Make Target                              | Command                                               | Description                             |
|------------------------------------------|-------------------------------------------------------|-----------------------------------------|
| **make install \[environment\_type]**    | `sh/system/install.sh`                                | One‑shot install                        |
| **make i**                               | `make install`                                        | Alias                                   |
| **make secret**                          | `sh/env/secret-gen.sh`                                | Create `.env.secret`                    |
| **make env \[environment\_type]**        | `sh/env/init.sh $(PARAMS)`                            | Re‑build root `.env` from parts         |
| **make certbot**                         | `sh/system/certbot.sh $(PARAMS)`                      | Obtain or renew SSL certificates        |
| **make ssl**                             | `make certbot`                                        | Alias                                   |
| **make core-install**                    | `wp-cli/core-install.sh`                              | Idempotent WordPress core install       |
| **make watch**                           | `sh/dev/npm-watch.sh $(PARAMS)`                       | Front‑end watch with BrowserSync        |
| **make up \[environment\_type]**         | `docker compose up -d`                                | Start (or rebuild) containers, detached |
| **make upd \[environment\_type]**        | `docker compose up`                                   | Same, foreground                        |
| **make down**                            | `docker compose down -v`                              | Stop containers and drop named volumes  |
| **make restart \[environment\_type]**    | `docker compose restart`                              | Quick service restart                   |
| **make recreate \[environment\_type]**   | `docker compose up --force-recreate`                  | Rebuild & replace every container       |
| **make import \<file.sql>**              | `sh/database/import.sh -f $(PARAM1)`                  | Import SQL dump and fix URLs            |
| **make export**                          | `sh/database/export.sh`                               | Dump current DB to `tmp/`               |
| **make replace \[search] \[replace]**    | `wp search-replace $(PARAMS)`                         | Database search/replace                 |
| **make migrate \<source\> \<dest\>**     | `sh/system/migrate.sh -s $(PARAM1) -d $(PARAM2)`      | Push/pull DB between environments       |
| **make pma**                             | `docker compose run phpmyadmin`                       | Throw‑away phpMyAdmin session           |
| **make mailhog**                         | `docker compose run mailhog`                          | MailHog UI for local SMTP               |
| **make log \[service]**                  | `docker compose logs -f $(PARAMS)`                    | Tail service logs                       |
| **make run \<service\>**                 | `sh/dev/run.sh run $(PARAMS)`                         | Starts a one-off container with shell   |
| **make exec \<service\>**                | `sh/dev/run.sh exec $(PARAMS)`                        | Opens a shell in running container      |
| **make lint**                            | `composer lint && npm run lint`                       | PHP & JS linters inside containers      |
| **make terraform \<command\>**           | `terraform -chdir=iac/terraform $(PARAMS)`            | Terraform helpers                       |
| **make ansible \<command\>**             | `ansible-playbook iac/ansible/playbook.yml $(PARAMS)` | Provision or deploy with Ansible        |
| **make docker build\|push \[service\]**  | `sh/system/docker.sh $(PARAMS)`                       | Build, push docker images to Registry   |
| **make docker clean**                    | `sh/system/docker.sh $(PARAMS)`                       | Clean all docker images and containers  |

---

## UID/GID Handling

`CURRENT_UID` and `CURRENT_GID` are exported to every container so that WordPress, npm and composer outputs stay writable from the host. On macOS these values are forced to **1000** to match Docker’s default user.


