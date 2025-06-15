## Usage 🚀

The project is ready to use immediately after installation, but you can stop, recreate, and launch the containers in different environments.

Below are the most common commands to help you spin things up and keep them running.

---

### 1. Boot the stack

```bash
# Local (default)
make up

# Specific environment type
make up stage         # stage as defined in ./config/environment/.env.type.stage
make up prod          # production
```

`make up` is a thin wrapper around `docker compose up -d`.

---

### 2. Working inside containers

| Task                      | Command                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| Drop into any service     | `make run <service>` <br>e.g. `make run php`                      |
| Execute a one‑off command | `make exec <service> <cmd>` <br>e.g. `make exec php wp user list` |
| View logs                 | `make log` or `make log nginx`                                    |
| Stop everything           | `make down`                                                       |
| Restart (keeps data)      | `make restart`                                                    |
| Recreate images           | `make recreate`                                                   |

All source code is volume‑mounted, so edits on your host appear instantly inside PHP‑FPM and Nginx.

---

### 3. Managing environment variables & secrets

1. **Environment type**  Each file in `config/environment/.env.type.*` describes one *type* (local, stage, prod…).  The installer concatenates the chosen file with `.env.secret.<type>.local` to produce the root `.env`.

2. **Private secrets**  Add sensitive keys to `.env.secret.<type>.local` *after* installation.

   ```dotenv
   # .env.secret.local
   DB_PASSWORD=supersecret
   JWT_AUTH_SECRET_KEY=generate_this_pass
   ```

3. **Regenerate the root file**

   ```bash
   make secret          # or bash sh/env/secret-gen.sh
   ```

> **Warning**: never commit secrets—GitHub will flag them and CI will fail.

---

### 4. Composer, WP‑CLI & NPM

Run CLI tools from inside their dedicated containers:

```bash
# PHP Composer
make run composer        # opens a bash shell
composer install         # now inside the container

# WP‑CLI
make exec php wp plugin list

# Node / NPM (theme assets)
make run node
npm run watch            # hot‑reloading dev build
npm run build            # production assets (minified, RTL, source‑maps off)
```

The theme lives in `web/wp-content/themes/starter-kit-theme/` and ships with **Laravel Mix 6**; feel free to swap it for Vite or your preferred bundler.

---

### 5. Database utilities

| Command                    | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `make export`              | Dump the current DB to `./backups/latest.sql.gz`.       |
| `make import <file>`       | Import a dump into the running MySQL service.           |
| `make replace <old> <new>` | `wp search-replace` wrapper—useful after a domain move. |

For one‑offs you can also enter the MySQL client:

```bash
make exec mariadb mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
```

---

### 6. Asset & code quality tooling

* **PHP** – `composer lint` runs PHP\_CodeSniffer with WordPress rules.
* **JS/CSS** – ESLint, Stylelint, and Prettier are pre‑configured; run `npm run lint`.
* **CI** – GitHub Actions lint every PR; see `.github/workflows/workflow-code-qa.yml`.

---

### 7. Logs & debugging

| Path / URL                          | Description                                    |
| ----------------------------------- | ---------------------------------------------- |
| `logs/nginx/*.log` (host)           | Access & error logs, rotated daily.            |
| `logs/php/*.log` (host)             | PHP‑FPM, WP debug, and Xdebug traces.          |
| `/tools/opcache.php`                | CLI to inspect and reset OPCache (local only). |
| `make exec php bash -c "xdebug on"` | Enable live Xdebug inside the PHP container.   |

Set `WP_DEBUG=true` in the relevant `.env.type.*` to surface WordPress notices.

---

### 8. Extending the stack

The starter kit exposes a single **Docker Compose override point**: `docker-compose.build.yml`. Drop additional services (Redis, Elasticsearch, etc.) there and reference them from `docker-compose.yml` where needed.

Terraform + Ansible playbooks live in `iac/` and assume an Ubuntu 22.04 target. Run `terraform apply` to provision a new VPS, then `ansible-playbook site.yml` to push the container stack.

---

### 9. Typical workflow recap

```text
git clone git@github.com:your-org/your-site.git
cd your-site
make install         # once
make up              # start containers
make run node        # compile assets
code .               # hack away
make export          # dump DB before pushing
git commit -am "Feature: …"
```

You are now ready to **develop features, build assets, and ship** with confidence. 
Jump to the next chapter to learn how to **customise the Starter Kit theme**—hooks, service container, block registration, and more.
