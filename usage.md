# Usage

⏱️ Start Coding in 1 Minute

The StarterKit ships with a **Makefile** that wraps every Docker Compose and shell command you need for daily development. This chapter shows the exact steps to go from a fresh install to writing PHP, JS, and CSS in your theme or plugins.

---

## 1. After Installation

After installation, all containers are already running — there's nothing else to start manually.
To begin compiling front-end assets, just run:

```bash
make watch
```

This runs `npm run dev` inside the Node container with file watching enabled.

---

## 2. Common Development Commands

> All available `make` targets are documented in [Makefile Reference](#) (coming soon).

| Command              | Under the hood                          | Description                            |
|----------------------|-----------------------------------------|----------------------------------------|
| `make up`            | `docker compose up -d`                  | Start all services in detached mode    |
| `make down`          | `docker compose down`                   | Stop containers and remove networks    |
| `make restart`       | `docker compose restart`                | Quick services restart                 |
| `make recreate`      | `docker compose up -d --force-recreate` | Recreate containers to reapply configs |
| `make log`           | `docker compose logs -f`                | Tail logs from all or one service      |

---

## 3. Start the Environment

```bash
make up [environment]
```

`environment` is optional and defaults to `local`. You can also use `stage` or `prod` to load the appropriate config.

Examples:

```bash
make up              # local environment (default)
make up stage        # uses .env.type.stage
make up prod         # uses .env.type.prod
```

What happens:

* Docker images are pulled from the registry (unless cached) and containers are started.
* The selected `.env.type.*` is merged into the final `.env` file.
* WordPress is available at `http://<APP_DOMAIN>`.

---

## 4. Run Commands Inside Containers

```bash
make run php                 # interactive shell (bash) in PHP-FPM
make exec php wp plugin list # one-off WP-CLI command
make run node                # interactive shell in Node
```

* `make run <service>` opens an interactive shell.
* `make exec <service>` runs a command directly.

---

## 5. Logs & Debugging

```bash
make log
make log nginx
make log php
```

Logs are available on the host system:

| Path               | Contents                    |
| ------------------ | --------------------------- |
| `logs/nginx/*.log` | Access and error logs       |
| `logs/php/*.log`   | PHP-FPM and WordPress debug |

> **Xdebug** is preinstalled. Enable it inside the PHP container with:
>
> ```bash
> make exec php bash -c "xdebug on"
> ```

---

## 6. Database Helpers

| Task                  | Command                                 |
| --------------------- | --------------------------------------- |
| Dump current DB       | `make export` → `backups/latest.sql.gz` |
| Import dump           | `make import path/to/dump.sql.gz`       |
| Search & replace URLs | `make replace old.test new.local`       |

---

## 7. Asset Pipeline (Theme)

```bash
make run node
cd web/wp-content/themes/starter-kit-theme
npm install          # only once
npm run dev          # dev build with source maps
npm run prod         # minified production build
```

You can also use the shortcut:

```bash
make watch           # run dev build + file watcher inside container
```

Compiled files are written to:

```
web/wp-content/themes/starter-kit-theme/dist/
```

---

You’re now ready to code. See the next sections for extending the stack, managing environments, and theme development.




