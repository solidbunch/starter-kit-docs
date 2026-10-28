# Database management

Run the commands on this page from the root of your project (the folder with the `Makefile` and
`docker-compose.yml`). `<env>` is your environment type (`local`, `dev`, `stage` or `prod`), the
same value you pass to `make up`. If you leave it out, `make` uses `APP_DEFAULT_ENV_TYPE` from
`.env.main` (`local` by default), so always pass it on `dev`, `stage` and `prod`. `.env.main` and
`.env.secret` are in `config/environment/`.

`make export`, `make import` and `make exec` take no `<env>`. They use the `.env` that `make env`,
`make up` or `make recreate` wrote last, so run one of them first if `.env` does not exist yet.

## Upgrading MariaDB version

If you change `APP_DATABASE_IMAGE` (in `config/environment/.env.main`) to a different `major.minor`
MariaDB version, the `mariadb` container does not start until you upgrade the data in `./db-data`.
This is the **version guard**: it stops a new version from running on old data by accident. It also
stops the container when `db-data` has no `mariadb_upgrade_info` file; its message then tells you
to start once with `MARIADB_AUTO_UPGRADE=1`. The guard is part of the kit's `mariadb` image; [Docker Images](docker-images.md) shows how to check
that your image has it. Follow the steps below.

No action is needed if you only change the patch number (`z` in `x.y.z`), or if `./db-data` is empty.

1. **Back up** while the old version is still running, before you change `APP_DATABASE_IMAGE`.
   Downgrading is not supported, so the backup is your only way back.

   ```bash
   make export
   ```

   `make export` needs the database container running. It writes the dump of the site database to
   `./tmp/`; the file name starts with your `APP_NAME`.

   Optional, for a faster rollback: also copy the data directory. It needs free space equal to the
   size of `db-data`. Stopping MariaDB takes the site's database offline until step 2 starts it
   again. On Linux, the files in `db-data` belong to the container's `mysql` user, so reading them
   from your machine needs `sudo`:

   ```bash
   df -h . && sudo du -sh db-data
   docker compose stop mariadb
   sudo cp -a db-data db-data.bak-$(date +%F)
   ```

   `db-data.bak-<date>` (`<date>` is the day you made the copy) is not covered by `.gitignore`;
   delete it once the upgrade is verified.

   If the upgrade goes wrong, see [Rolling back](#rolling-back) below.

2. **Upgrade** — set the new `APP_DATABASE_IMAGE` (keep the image name, change the tag), then
   recreate the project with `MARIADB_AUTO_UPGRADE=1`. On start, the `mariadb` image runs
   `mariadb-upgrade` itself. All project containers are recreated, so the site is unavailable for
   a moment:

   ```bash
   MARIADB_AUTO_UPGRADE=1 make recreate <env>
   ```

3. **Verify** — the log shows `Finished mariadb-upgrade`, the container is `healthy` (it shows
   `starting` until the first health check passes), and `db-data/mariadb_upgrade_info` shows the
   new version (`x.y.z-MariaDB`):

   ```bash
   docker compose logs --tail 50 mariadb
   docker compose ps mariadb
   cat db-data/mariadb_upgrade_info
   ```

4. **Switch the flag off** — recreate the container again, without the variable. If you set
   `MARIADB_AUTO_UPGRADE=1` in `.env.secret` instead of on the command line, comment that line out
   first. Otherwise the container keeps `MARIADB_AUTO_UPGRADE=1`, the version guard stays off, and
   the next version change would upgrade your data without stopping first:

   ```bash
   make recreate <env>
   ```

### Rolling back

Use this only if the upgrade failed or you need the old version back. Downgrading in place is not
supported, so restore your backup:

- **From the data-directory copy:** stop MariaDB (`docker compose stop mariadb`), move the current
  `db-data` aside and put the copy in its place (`mv db-data db-data.failed`, then
  `mv db-data.bak-<date> db-data`), set the old `APP_DATABASE_IMAGE`, then run
  `make recreate <env>`.
- **From the dump:** set the old `APP_DATABASE_IMAGE`, stop MariaDB (`docker compose stop mariadb`)
  and move the current `db-data` aside (for example `mv db-data db-data.old`) so MariaDB starts on
  an empty directory, run `make recreate <env>`, then
  `make import tmp/<dump file>.sql` (`<dump file>` is the file `make export` created in `./tmp/`).
  `make import` asks `Are you sure? (y/n)`. Then it runs a URL search-replace in the `php`
  container, so `php` must be running.

If you changed `APP_DATABASE_IMAGE` and the container refuses to start before you ran the upgrade,
your data is untouched (`docker compose logs mariadb` shows the `[version-guard]` message). Set the
old `APP_DATABASE_IMAGE` back and run `make recreate <env>`. `make export` cannot run while the
container is down.

### Collation drift after a MariaDB version bump (optional)

A MariaDB version can have a different **default collation** (the rule it uses to compare and sort
text) than the version before it. A database keeps the default it got when it was created, so a
version bump does not change your existing database. A table created without an explicit collation
(typically by a plugin) takes its database's default, while WordPress creates its own tables with
the collation from `WP_DB_COLLATE` (or its own default when that is empty, see below). If the two
differ, your tables end up on different collations.

WordPress sets the collation through `WP_DB_COLLATE` in `.env.secret`. New projects get a value from
the template. If the line in your `.env.secret` is empty or commented out (for example, the file was
generated from an older template), WordPress uses its own default (`utf8mb4_unicode_520_ci`) for
the tables it creates.

Your site keeps working either way. Do this only if you want all tables on one collation, or if you
see `Illegal mix of collations` errors. Setting `WP_DB_COLLATE` alone is not enough, because
existing tables keep their current collation — you also need to convert them (collation step 3
below).

Run the commands below inside the database container. Open a shell once and keep it open (you are
the `www-data` user there, which is fine: every `mariadb` command logs in as the MariaDB `root`
user with its password):

```bash
make exec mariadb
```

Each `mariadb -u root -p` command asks for a password: enter `MYSQL_ROOT_PASSWORD` from
`.env.secret` (for example, find it with `grep MYSQL_ROOT_PASSWORD config/environment/.env.secret`). The commands assume the database is named `wordpress` (`MYSQL_DATABASE` in
`.env.secret`); adjust it if yours differs.

**Collation step 1. Check what your existing tables are actually using:**

```bash
mariadb -u root -p wordpress -e "SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();"
```

**Collation step 2. Choose the target collation.** Either keep the one most of your tables already use (collation step 1), or
switch to the server's current default, which you can see with:

```bash
mariadb -u root -p -e "SHOW VARIABLES LIKE 'collation_server';"
```

**Collation step 3. Back up, then convert the database and every table.** Run `make export` first, in another
terminal on your host (not inside the container shell).

> ⚠️ Each table is locked while it is rewritten. On large tables this can take a while, so test on
> staging before running it on production.

Replace `your_collation` with the collation you chose in collation step 2, here and in the next command:

```bash
mariadb -u root -p -e "ALTER DATABASE wordpress CHARACTER SET utf8mb4 COLLATE your_collation;"
```

Then convert every table. This generates one `ALTER TABLE` per table and runs it
(`/tmp/collation_convert.sql` is a temporary file inside the container):

```bash
mariadb -u root -p -N -e "SELECT CONCAT('ALTER TABLE \`', TABLE_NAME, '\` CONVERT TO CHARACTER SET utf8mb4 COLLATE your_collation;') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();" wordpress > /tmp/collation_convert.sql
mariadb -u root -p wordpress < /tmp/collation_convert.sql
```

**Collation step 4. Pin the collation for future tables.** Leave the container shell (`exit`), set
`WP_DB_COLLATE` in `.env.secret` on your host to the same value (uncomment the line if it is
commented out), then run:

```bash
make recreate <env>
```

**Collation step 5. Verify.** Open the homepage and wp-admin, then check `logs/wordpress/debug.log` for new errors
(local and dev; on stage and prod WordPress logs to the container log: `docker compose logs php`).

## Local database tunnel

The database is not reachable from your machine by default: the `mariadb` service never publishes a
host port. To connect a database tool (for example
[MySQL Workbench](https://www.mysql.com/products/workbench/), [HeidiSQL](https://www.heidisql.com/)
or [PHPStorm](https://www.jetbrains.com/help/phpstorm/configuring-ssh-and-ssl.html)), open a tunnel:
`make db-tunnel start` starts a temporary container that forwards `127.0.0.1:<port>` to MariaDB.

Prerequisite: run `make up` first. The tunnel script fails if the database container does not exist.

1. Start the tunnel. The default port is `3306`; if it is taken on your machine, pass another one:

   ```bash
   make db-tunnel start
   make db-tunnel start 3307
   ```

   If a tunnel is already running, `start` does nothing and prints the port you typed, not the
   port the tunnel really uses. Run `make db-tunnel stop` first to change the port.

2. Check the tunnel status:

   ```bash
   make db-tunnel status
   ```

   `status` takes the port as an argument too. If you started the tunnel on another port, add it
   (`make db-tunnel status 3307`); without it the message shows port 3306 even though the tunnel
   listens on 3307.

3. In your database tool, connect to host `127.0.0.1`, the port you chose in step 1 (3306 by
   default), and the credentials
   from `.env.secret` (`MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`).

4. Stop the tunnel when you are done:

   ```bash
   make db-tunnel stop
   ```

## phpMyAdmin

phpMyAdmin is not running by default. Start its container first.

1. In `.env.main`, set `PMA_EXT_PORT` (the default is `8801`) to a port that no other service or
   project on your machine uses. Each installation needs its own value. After editing, run
   `make env <env>` so the new port takes effect (`make pma` does not regenerate `.env`).

2. Start the phpMyAdmin container:

   ```bash
   make pma
   ```

   It runs in the foreground (press Ctrl+C to stop it) and needs the application stack to be
   running (`make up`).

3. Open `your-app-domain.com:<PMA_EXT_PORT>` in the browser (`your-app-domain.com` is the
   `APP_DOMAIN` of your environment type, in `config/environment/.env.type.<env>`). For example, with
   `PMA_EXT_PORT=8801`, open `your-app-domain.com:8801`. phpMyAdmin is configured with the `root`
   user and `MYSQL_ROOT_PASSWORD` from `.env`, so it logs in as `root` on its own.

> ⚠️ Do not run phpMyAdmin on a public server (production or an open stage). It is not secure.

## Reset database root password

> ⚠️ While `--skip-grant-tables` is on, anyone who can reach MariaDB can log in without a password.
> Do steps 1–6 in one go and do not skip steps 5 and 6.

1. In the `mariadb` service in `docker-compose.yml`, uncomment `command: --skip-grant-tables`.

2. Recreate the containers so the new `command` is applied (a plain restart keeps the old one):

   ```bash
   make recreate <env>
   ```

3. Open a shell in the `mariadb` container:

   ```bash
   make exec mariadb
   ```

4. In that shell, start the MariaDB client (no password is needed while `--skip-grant-tables` is on):

   ```bash
   mariadb --ssl=OFF
   ```

   At the client prompt, run the following. Replace `new_password` with the new root password:

   ```sql
   FLUSH PRIVILEGES; ALTER USER 'root'@'%' IDENTIFIED BY 'new_password'; ALTER USER 'root'@'localhost' IDENTIFIED BY 'new_password';
   ```

   There are two `root` users in the database, one with host `%` and one with host `localhost`, so
   the command resets both (`mariadb -u root -p` inside the container connects as `root@localhost`).
   To reset another user's password, change the user name and host in the `ALTER USER` command. To
   list all users and hosts, run:

   ```sql
   SELECT User, Host FROM mysql.user;
   ```

5. Comment out `command: --skip-grant-tables` in `docker-compose.yml` again.

6. Recreate the containers again, so the original `command` comes back:

   ```bash
   make recreate <env>
   ```

Afterwards set `MYSQL_ROOT_PASSWORD` in `config/environment/.env.secret` to the new password and run
`make env <env>`: phpMyAdmin logs in as root with it. The `mariadb` container ignores this variable
once `db-data` exists, so the variable does not change the password stored in the database.
