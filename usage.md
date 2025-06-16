# Usage

> ⏱️ Start Coding in 1 Minute

The StarterKit ships with a **Makefile** that wraps every Docker Compose and shell command you need for daily development. This chapter shows the exact steps to go from a fresh install to writing PHP, JS, and CSS in your theme or plugins.

---

## 1. After Installation

After installation, all containers are already running — there's nothing else to start manually.
To begin compiling front-end assets, just run:

```bash
make watch
```

This runs `npm run dev` inside the Node container with file watching enabled.

**Now you can start coding your theme or plugins. Next, let's cover the most common commands you will use during development**.

---

## 2. Common Development Commands

> All available `make` targets are documented in [Makefile Reference](makefile-reference.md) (coming soon).

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

These commands let you work inside containers — either by starting a clean one-off shell or connecting to an already running service.

- `make run <service>` — starts a one-off container with an interactive shell (e.g. Composer or Node). Useful for isolated testing or when the container isn’t running. It rebuilds the image if needed and removes the container afterward.
- `make exec <service>` — opens a shell inside an already running container (e.g. PHP or Nginx). Ideal for inspecting running services or executing WP‑CLI commands.

Both commands run as www-data (from .env:DEFAULT_USER) and display a welcome message. The container user runs with the same UID as the host user to avoid permission issues on shared volumes.

```bash
make run php
make exec php
make run node
```

---

## 5. Logs & Debugging

```bash
make log
make log nginx
make log php
```

These commands follow live logs from all services or specific ones like Nginx and PHP-FPM.

Logs are written to the host filesystem:

| Path                          | Contents              |
|-------------------------------|-----------------------|
| `logs/nginx/*.log`            | Access and error logs |
| `logs/wordpress/debug.log`    | WordPress debug       |
| `logs/wordpress/*XDEBUG*.out` | Xdebug logs           |
| `logs/letsencrypt/*.log`      | Certbot logs          |


> **Xdebug** is available in any environment where `xdebug.ini` is included.  
> By default, it's configured in `config/php/local.d/xdebug.ini`, which is only mounted in the `local` environment.
>
> Xdebug is inactive by default.  
> To activate debugging, profiling, and tracing, pass `XDEBUG_TRIGGER=1` as a query parameter, POST field, or HTTP header.
>
> Logs are written to `logs/wordpress/xdebug-log.log` on the host.


---

## 6. Asset Pipeline (Theme)

The theme uses **Laravel Mix** to compile JavaScript and Sass files. Assets are built inside the Node container.

```bash
make run node
```

```bash
cd wp-content/themes/starter-kit-theme
npm install      # only once (runs on `make install`)
npm run dev      # development build with source maps
npm run prod     # production build (minified, no maps)
```

For development, you can use the command:

```bash
make watch           # run dev build + file watcher inside container
```

Compiled assets are written to:

- `web/wp-content/themes/starter-kit-theme/assets/build/styles/` — for global SCSS
- `web/wp-content/themes/starter-kit-theme/assets/build/js/` and `assets/build/js/bootstrap/` — for global JS
- `web/wp-content/themes/starter-kit-theme/blocks/<BlockName>/build/` — for block-specific JS and SCSS

---

## 7. Composer (PHP Packages)

To use PHP Composer, run the Composer container:

```bash
make run composer
```

This starts an interactive shell inside a dedicated Composer container, with access to the full project volume.

Once inside, you can run any Composer command. By default, you're placed in `/srv` — the root of your project.

Typical commands:

```bash
composer install      # install dependencies from composer.lock
composer update       # update dependencies and regenerate lockfile
composer outdated     # check for newer package versions
```

If you need to run Composer commands inside a theme or plugin folder, just change into that directory:

```bash
cd web/wp-content/themes/starter-kit-theme
composer install
```

> The Composer container is ephemeral — it starts and stops per command, ensuring a clean, reproducible environment each time.





