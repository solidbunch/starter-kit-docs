# Known pitfalls

The recipes referenced below are files next to this one: `recipes/recipe-a-mariadb-states.sh`, `recipes/compare-image-guard.sh`, `recipes/recipe-b-restart-vs-recreate.sh`.

Checklist of mistakes that a real audit made. For each item, check the thing named and read the
lines named; the lines are paths in the foundation checkout as of 2026-10-27 and drift, so re-derive
them with `grep -n` on every run.

1. **`make restart` does not apply edited compose config; `make recreate` does.** Before a doc says
   that a changed compose file or env value takes effect after a restart, check which command it names.
   - Code: `Makefile:132-134` (`restart` runs `init.sh`, then `docker compose ... restart`) and
     `Makefile:136-138` (`recreate` runs `init.sh`, then `docker compose ... up -d --force-recreate`).
   - The behaviour itself is Docker's, not foundation code. Evidence: `recipes/recipe-b-restart-vs-recreate.sh`, executed on
     2026-10-27 (Docker Compose v5.6.0): the command was `["sleep","300"]` after `up -d`,
     `["sleep","300"]` after `restart` although the file said 301, and `["sleep","301"]` after
     `up -d --force-recreate`.
2. **`make up`, `make recreate` and `make restart` without an environment word fall back to
   `APP_DEFAULT_ENV_TYPE` and regenerate `.env`.** Before a doc shows one of them, check that it
   passes the environment type when the doc means a non-default one.
   - `sh/env/init.sh:14` sources `.env.main`; `:18` sets the type to `APP_DEFAULT_ENV_TYPE`;
     `:21-22` replace it with the first argument when one is given; `:32` and `:40` rewrite
     `.env.runtime` and `.env` every time.
   - `config/environment/.env.main:31` sets `APP_DEFAULT_ENV_TYPE=local`.
   - `Makefile:111-116` (`up`), `:132-134` (`restart`) and `:136-138` (`recreate`) run `init.sh` with
     the words after the target.
3. **`make exec` and `make run` read only three words: mode, service, user.** Before a doc gives one
   of them extra words, check that the extra words are not silently dropped.
   - `Makefile:166-172` passes the words to `sh/dev/run.sh`.
   - `sh/dev/run.sh:13-14` takes the mode from the first word, `:19-20` the service from the second
     (`:25` maps `wp` to `php`), `:30-33` the user from the third, defaulting to `DEFAULT_USER`.
4. **An image published under an existing tag is not re-pulled and can be older than the source.**
   Before a doc says that a guard, flag or default exists "in the image", compare the image with the
   source (`recipes/compare-image-guard.sh`) instead of reading the source alone.
   - `docker-compose.yml:4` is `image: "${APP_DATABASE_IMAGE}"`, no `docker-compose*.yml` file sets
     `pull_policy`, and `config/environment/.env.main:39` pins the tag
     `ghcr.io/solidbunch/starter-kit-mariadb:11.8.9-noble`.
   - Evidence: the comparison, executed on 2026-10-27. The guard in the local image differs from
     `dockerfiles/mariadb/docker-entrypoint.d/10-version-guard.sh` (the image compares the full
     `x.y.z`, the source compares `major.minor`). The image was created
     `2026-10-24T22:48:35Z`; the commit that changed the guard is `291d8e1`, `2026-10-25T15:15:42Z`.
     `recipes/recipe-a-mariadb-states.sh` confirmed it: the shipped image refused the patch-diff state (`11.8.8` data with the
     `11.8.9` image, exit code 1), which the source guard would let through; other-series data was
     refused too, and `MARIADB_AUTO_UPGRADE=1` started it.
5. **WordPress picks its own collation when `WP_DB_COLLATE` is empty.** Before a doc names the
   collation of a new install, check what an empty value leads to.
   - `docker-compose.yml:50` passes `WP_DB_COLLATE` with an empty default;
     `web/wp-config/wp-config.php:76` defines `DB_COLLATE` from it with an empty default.
   - `web/wp-core/wp-includes/class-wpdb.php:881` (`determine_charset`): an empty collation becomes
     `utf8mb4_unicode_ci` (`:893`), and that becomes `utf8mb4_unicode_520_ci` (`:900-901`) when the
     server supports it. `web/wp-core` is not tracked, so it is absent from a scratch project.
6. **`WP_DEBUG_LOG` goes to a file only on local and dev.** Before a doc says where debug output
   ends up, check the environment type it describes.
   - `config/environment/.env.type.local:45` and `.env.type.dev:48` set
     `/var/log/wordpress/debug.log`; `.env.type.stage:48` and `.env.type.prod:48` set `/dev/stderr`.
   - `web/wp-config/wp-config.php:142` defines `WP_DEBUG_LOG` from the variable.
