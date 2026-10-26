# Database management

`<env>` in the commands below is your environment type: `local`, `dev`, `stage` or `prod`.

## Upgrading MariaDB version

If you change `APP_DATABASE_IMAGE` (in `config/environment/.env.main`) to a different `major.minor`
MariaDB version, the `mariadb` container does not start until you upgrade the data in `./db-data`.
This is the **version guard**: it stops a new version from running on old data by accident. Follow
the steps below.

No action is needed if you only change the patch number (`z` in `x.y.z`), or if `./db-data` is empty.

1. **Back up** while the old version is still running, before you change `APP_DATABASE_IMAGE`.
   Downgrading is not supported, so the backup is your only way back.

   ```bash
   make export
   ```

   The dump of the site database is written to `./tmp/`.

   Optional, for a faster rollback: also copy the data directory. It needs free space equal to the
   size of `db-data`.

   ```bash
   df -h . && du -sh db-data
   docker compose stop mariadb
   cp -a db-data db-data.bak-$(date +%F)
   ```

   To roll back:

   - From the copy: stop MariaDB, put the copy back as `db-data`, set the old `APP_DATABASE_IMAGE`,
     then run `make recreate <env>`.
   - From the dump: run the old image tag, then `make import tmp/<dump file>.sql`, where
     `<dump file>` is the file `make export` created.

   If you already changed the image and the container refuses to start, `make export` cannot run.
   Use the copy, or undo the change by setting the old `APP_DATABASE_IMAGE` back.

2. **Upgrade** — set the new `APP_DATABASE_IMAGE`, then recreate the container with
   `MARIADB_AUTO_UPGRADE=1`. On start, the image runs `mariadb-upgrade` itself:

   ```bash
   MARIADB_AUTO_UPGRADE=1 make recreate <env>
   ```

3. **Verify** — the log shows `Finished mariadb-upgrade`, the container is `healthy`, and
   `db-data/mariadb_upgrade_info` shows the new version:

   ```bash
   docker compose logs --tail 50 mariadb
   docker compose ps mariadb
   cat db-data/mariadb_upgrade_info
   ```

4. **Switch the flag off** — recreate the container again, without the variable. Otherwise it keeps
   `MARIADB_AUTO_UPGRADE=1`, the version guard stays off, and the next version change would upgrade
   your data without stopping first:

   ```bash
   make recreate <env>
   ```

### Collation drift after a MariaDB version bump (optional)

A MariaDB version bump can change the server's **default collation** (the rule it uses to compare
and sort text). A table created without an explicit collation gets the new default, so tables
created before and after the bump can end up on two different collations.

WordPress sets the collation through `WP_DB_COLLATE` in `.env.secret`. New projects get a value from
the template. If the line in your `.env.secret` is empty or commented out (for example, the file was
generated from an older template), the choice is left to the server and the drift above can happen.

Your site keeps working either way. Do this only if you want all tables on one collation, or if you
see `Illegal mix of collations` errors. Setting `WP_DB_COLLATE` alone is not enough, because
existing tables keep their current collation — you also need to convert them (step 3).

**1. Check what your existing tables are actually using:**

```bash
make exec mariadb mariadb -u root -p -e "SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();"
```

When prompted for a password, enter `MYSQL_ROOT_PASSWORD` from `.env.secret`.

**2. Choose the target collation.** Either keep the one most of your tables already use (step 1), or
switch to the server's current default, which you can see with:

```bash
make exec mariadb mariadb -u root -p -e "SHOW VARIABLES LIKE 'collation_server';"
```

**3. Back up (`make export`), then convert the database and every table.** Replace
`your_collation` with the collation you chose in step 2. The commands assume the database is named
`wordpress` (`MYSQL_DATABASE` in `.env.secret`); adjust it if yours differs.

> ⚠️ Each table is locked while it is rewritten. On large tables this can take a while, so test on
> staging before running it on production.

```bash
make exec mariadb mariadb -u root -p -e "ALTER DATABASE wordpress CHARACTER SET utf8mb4 COLLATE your_collation;"
```

Then convert every table. This generates one `ALTER TABLE` per table and runs it
(`/tmp/collation_convert.sql` is a temporary file you can delete afterwards):

```bash
make exec mariadb mariadb -u root -p -N -e "SELECT CONCAT('ALTER TABLE \`', TABLE_NAME, '\` CONVERT TO CHARACTER SET utf8mb4 COLLATE your_collation;') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();" wordpress > /tmp/collation_convert.sql
make exec mariadb mariadb -u root -p wordpress < /tmp/collation_convert.sql
```

**4. Pin the collation for future tables.** Set `WP_DB_COLLATE` in `.env.secret` to the same value,
then run:

```bash
make env <env>
make recreate <env>
```

**5. Verify.** Open the homepage and wp-admin, then check `logs/wordpress/debug.log` for new errors.

## Local database tunnel

The database is not reachable from your machine by default: the `mariadb` service never publishes a
host port. To connect a database tool (for example
[MySQL Workbench](https://www.mysql.com/products/workbench/), [HeidiSQL](https://www.heidisql.com/)
or [PHPStorm](https://www.jetbrains.com/help/phpstorm/configuring-ssh-and-ssl.html)), open a tunnel:
`make db-tunnel` starts a temporary container that forwards `127.0.0.1:<port>` to MariaDB.

Prerequisite: run `make up` first. The tunnel fails if the database container is not running.

1. Start the tunnel. The default port is `3306`; if it is taken on your machine, pass another one:

   ```bash
   make db-tunnel start
   make db-tunnel start 3307
   ```

2. Check the tunnel status:

   ```bash
   make db-tunnel status
   ```

3. In your database tool, connect to host `127.0.0.1`, the port from step 1, and the credentials
   from `.env.secret` (`MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`).

4. Stop the tunnel when you are done:

   ```bash
   make db-tunnel stop
   ```

## phpMyAdmin

phpMyAdmin is not running by default. Start its container first.

1. In `.env.main`, set `PMA_EXT_PORT` to a port that no other service or project on your machine
   uses. Each installation needs its own value.

2. Start the phpMyAdmin container:

   ```bash
   make pma
   ```

3. Open `your-app-domain.com:<PMA_EXT_PORT>` in the browser. For example, with
   `PMA_EXT_PORT=8801`, open `your-app-domain.com:8801`.

> ⚠️ Do not run phpMyAdmin on a public server (production or an open stage). It is not secure.

## Reset database root password

> ⚠️ While `--skip-grant-tables` is on, anyone who can reach MariaDB can log in without a password.
> Do steps 1–6 in one go and do not skip step 5.

1. In the `mariadb` service in `docker-compose.yml`, uncomment `command: --skip-grant-tables`.

2. Restart the containers:

   ```bash
   make restart
   ```

3. Open a shell in the `mariadb` container:

   ```bash
   make exec mariadb
   ```

4. In that shell, start the MariaDB client:

   ```bash
   mariadb --ssl=OFF
   ```

   At the client prompt, run the following. Replace `new_password` with the new root password:

   ```sql
   FLUSH PRIVILEGES; ALTER USER 'root'@'%' IDENTIFIED BY 'new_password';
   ```

   To reset another user's password, change the user name and host in the `ALTER USER` command.
   There are two `root` users in the database, one with host `%` and one with host `localhost`. To
   list all users and hosts, run:

   ```sql
   SELECT User, Host FROM mysql.user;
   ```

5. Comment out `command: --skip-grant-tables` in `docker-compose.yml` again.

6. Restart the containers:

   ```bash
   make restart
   ```
