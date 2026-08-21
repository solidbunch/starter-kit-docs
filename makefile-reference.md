# Makefile Reference

The **Makefile** is a slim wrapper around a collection of shell scripts and `docker compose` calls, giving you short, memorable commands for every stage of your local and remote workflow.

---

## Preamble & Variables

| Name                          | Meaning                                                                                                                      |
|-------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `CURRENT_UID` / `CURRENT_GID` | Host user and group IDs, each bumped up to **1000** if it is below 1000 (a numeric `< 1000` check, on any OS). Injected into containers so generated files retain correct ownership. |
| `PARAMS`                      | Everything you type **after** the target — `make <target> [params...]` — forwarded to the called script.                     |
| `PARAM1…PARAM3`               | Shortcuts for the first three extra words — `make <target> [param1] [param2] [param3]`.                                      |
| `DEFAULT_USER`                | Docker user name read from `.env.main`, in result have `CURRENT_UID` and `CURRENT_GID`, so same IDs as Host user             |

---

## Targets

| Make Target                             | Command                                               | Description                                            |
|-----------------------------------------|-------------------------------------------------------|--------------------------------------------------------|
| **make install \[environment\_type]**   | `sh/env/secret-gen.sh` -> `sh/env/init.sh $(PARAMS)` -> `sh/system/install.sh` (Composer + npm install/build, in the toolkit containers) -> `docker compose $(COMPOSE_OVERRIDE) up -d` -> `sh/database/check.sh` -> `docker compose exec php ... bash /shell/wp-cli/core-install.sh` | One-shot install (full 6-step recipe) — `sh/system/install.sh` prompts `Are you sure? (y/n):` before proceeding |
| **make i**                              | `make install`                                        | Alias                                                  |
| **make secret**                         | `sh/env/secret-gen.sh`                                | Create `.env.secret`                                   |
| **make env \[environment\_type]**       | `sh/env/init.sh $(PARAMS)`                            | Re-build root `.env` from parts                        |
| **make ssl**                            | `bash ./sh/system/certbot.sh $(PARAMS)`               | Obtain or renew SSL certificates                       |
| **make local-cert \[force]**            | `bash ./sh/system/local-cert.sh $(PARAMS)`            | Locally-trusted (mkcert) HTTPS certificate for local dev, single- or multi-instance mode; `force` regenerates even if a valid cert exists |
| **make core-install**                   | `docker compose $(COMPOSE_OVERRIDE) exec php su -c "bash /shell/wp-cli/core-install.sh" $(DEFAULT_USER)` | Idempotent WordPress core install                      |
| **make watch**                          | `sh/dev/npm-watch.sh $(PARAMS)`                       | Front-end watch with BrowserSync                       |
| **make up \[environment\_type]**        | `sh/env/init.sh $(PARAMS)` -> `docker compose $(COMPOSE_OVERRIDE) up -d` | Start (or rebuild) containers, detached [^localci]     |
| **make upd \[environment\_type]**       | `sh/env/init.sh $(PARAMS)` -> `docker compose $(COMPOSE_OVERRIDE) up` | Same, foreground                                       |
| **make down**                           | `docker compose $(COMPOSE_OVERRIDE) down -v`          | Stop containers and drop named volumes [^localci]      |
| **make restart \[environment\_type]**   | `sh/env/init.sh $(PARAMS)` -> `docker compose $(COMPOSE_OVERRIDE) restart` | Quick service restart                                  |
| **make recreate \[environment\_type]**  | `sh/env/init.sh $(PARAMS)` -> `docker compose $(COMPOSE_OVERRIDE) up -d --force-recreate` | Rebuild & replace every container                      |
| **make import \<file.sql>**             | `sh/database/import.sh -f $(PARAM1) -t` then `docker compose $(COMPOSE_OVERRIDE) exec php su -c "bash /shell/wp-cli/search-replace.sh" $(DEFAULT_USER)` | Import SQL dump, then run search/replace to fix URLs   |
| **make export**                         | `sh/database/export.sh`                               | Dump current DB to `tmp/`                              |
| **make replace \[search] \[replace]**   | `docker compose $(COMPOSE_OVERRIDE) run --rm php su -c "bash /shell/wp-cli/search-replace.sh $(PARAMS)" $(DEFAULT_USER)` | Database search/replace                                |
| **make migrate \<source\> \<dest\>**    | `sh/system/migrate.sh -s $(PARAM1) -d $(PARAM2) -t`   | Push/pull DB between environments                      |
| **make pma**                            | `docker compose -f docker-compose.toolkit.yml run --service-ports --rm phpmyadmin` | Throw-away phpMyAdmin session              |
| **make db-tunnel start\|stop\|status \[port]** | `bash ./sh/system/db-tunnel.sh $(PARAMS)`        | Local TCP tunnel to an instance's MariaDB (default port 3306) when `APP_MULTI_INSTANCE=1` hides the host port; run `make up` first |
| **make mailhog**                        | `docker-compose -f docker-compose.toolkit.yml run --service-ports --rm --name mailhog mailhog` | MailHog UI for local SMTP                  |
| **make log \[service]**                 | `docker compose logs -f $(PARAMS)`                    | Tail service logs                                      |
| **make run \<service\>**                | `sh/dev/run.sh run $(PARAMS)`                         | Starts a one-off container with shell                  |
| **make exec \<service\>**               | `sh/dev/run.sh exec $(PARAMS)`                        | Opens a shell in running container                     |
| **make lint**                           | `docker compose -f docker-compose.toolkit.yml run -it --rm composer su -c "cd web/wp-content/themes/${WP_DEFAULT_THEME} && composer lint" $(DEFAULT_USER)` then `docker compose -f docker-compose.toolkit.yml run -it --rm node su -c "cd wp-content/themes/${WP_DEFAULT_THEME} && npm run lint" $(DEFAULT_USER)` | PHP & JS linters inside toolkit containers |
| **make basis**                          | `docker compose -f docker-compose.toolkit.yml run --rm -it iac su -c "cd /srv/kit-modules/basis && bash" $(DEFAULT_USER)` | Interactive shell in the IaC container, `cd`'d into `kit-modules/basis` [^kitmodule] |
| **make tf \<env\> \<command\>**         | `kit-modules/basis/sh/terraform.sh -e $(PARAM1) -c $(PARAM2)` | Run Terraform (`init`, `plan`, `apply`, `destroy`) for an environment [^localci] [^kitmodule] |
| **make ansible \<env\> \<playbook\> \[static]** | `kit-modules/basis/sh/ansible.sh -e $(PARAM1) -a $(PARAM2)` (adds `-s` if the third word is `static`) | Provision or deploy with Ansible; inventory is generated from Terraform outputs unless `static` is passed [^localci] [^kitmodule] |
| **make docker build\|push \[service\]** | `sh/system/docker.sh $(PARAMS)`                       | Build, push docker images to Registry                  |
| **make docker clean\|prune**            | `sh/system/docker.sh $(PARAMS)`                       | Prune all docker containers, images, volumes, networks |
| **make docker-login**                   | `sh/system/docker.sh login`                           | Registry auth only (ghcr.io) — no build/push           |
| **make monitoring \[on\|off\]**         | `kit-modules/monitoring-client/sh/monitoring.sh -m $(PARAM1)` | Run the monitoring-client scenario (alias: `make mon`) [^kitmodule] |
| **make proxy start\|stop\|logs\|deploy \<env\>** | `bash ./kit-modules/proxy/bin/proxy.sh $(PARAMS)` | Reverse proxy for multi-instance mode — requires the solidbunch/proxy kit module; `deploy <env>` is used by CI [^kitmodule] |
| **make localci up\|down\|tf\|ansible\|act** | `sh/local-ci/*` (dispatched by the first parameter) | Local CI/CD provisioning emulation harness — see `sh/local-ci/README.md` |
| **make validate-nginx**                 | `bash ./sh/system/validate-nginx.sh $(PARAMS)`        | Validate nginx config syntax (`nginx -t`) in a throwaway container, no app stack needed |

[^localci]: When `localci` is passed as an additional goal on the same command line (e.g. `make localci up`), this target is a no-op — `localci` runs its own version of the step instead. This is how `make localci up|down|tf|ansible` avoids running the step twice.
[^kitmodule]: Requires the corresponding kit-module to be installed. Kit-modules are paid add-ons, not included by default — see [Infrastructure](infrastructure.md).

---

## UID/GID Handling

`CURRENT_UID` and `CURRENT_GID` are exported to every container so that WordPress, npm and composer outputs stay writable from the host. The Makefile runs a numeric `< 1000` check on the host UID and GID (`Makefile:16-26`) — any value below 1000 is bumped up to **1000** to match Docker’s default user. This is not an OS check: the same numeric test runs regardless of platform, it just rarely triggers on Linux where the first regular user is usually UID/GID 1000 already.


