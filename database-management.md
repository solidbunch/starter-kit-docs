# Database management

### Upgrading MariaDB version

`APP_DATABASE_IMAGE` (`config/environment/.env.main`) pins the MariaDB version. The `mariadb` image
has a **version guard**: if its release series (`major.minor`) differs from the one that last
upgraded `./db-data`, the server does not start, instead of silently running the new series on old
data. Patch bumps within a series (a change of only `z` in `x.y.z`) start normally — images built
from an older Foundation version compared the full `x.y.z`, so make sure the host runs a current
image (see [Docker Images](docker-images.md)). A fresh, empty `./db-data` is not affected.

1. **Back up** — this is your rollback point (downgrading is not supported). Do it while the old
   version still runs, before the new image reaches the host:

   ```bash
   make export
   ```

   The dump of the site database is written to `./tmp/`. To roll back: run the old image tag and
   `make import tmp/<dump file>.sql`.

   Optional, for a faster rollback: stop MariaDB and copy the data directory (needs free space
   equal to `db-data`). To roll back with it: stop MariaDB, put the copy back as `db-data`, set the
   old image tag, `make recreate <env>`.

   ```bash
   df -h . && du -sh db-data
   docker compose stop mariadb
   cp -a db-data db-data.bak-$(date +%F)
   ```

   If the guard has already stopped the container, `make export` is not possible — use the copy.

2. **Upgrade** — start once with the flag; the image runs `mariadb-upgrade` itself:

   ```bash
   MARIADB_AUTO_UPGRADE=1 make recreate <env>
   ```

3. **Verify** — the log shows `Finished mariadb-upgrade`, the container is `healthy`, and the file
   holds the new version:

   ```bash
   docker compose logs --tail 50 mariadb
   cat db-data/mariadb_upgrade_info
   ```

4. **Switch the flag off** — the container keeps the variable it was created with, so recreate
   without it; otherwise the next version change would upgrade without stopping:

   ```bash
   make recreate <env>
   ```

#### Collation drift after a MariaDB version bump (optional)

A MariaDB major-version bump can also change the server's **default collation** (the rule it uses
to compare/sort text) for any new table created without one explicitly set. WordPress's
`DB_COLLATE` in `wp-config.php` is driven by `WP_DB_COLLATE` in `.env.secret`. The `.env.secret`
template sets a value, but check the `WP_DB_COLLATE` line in your own `.env.secret`: if it is empty
or commented out (for example in a file generated from an older template), WordPress falls back to
whatever the server picks — which means tables created before the version bump and tables created
after it can end up on two different collations.

This is **optional, not required** — your site keeps working either way. Pin a collation only if
you want to eliminate the drift. Pinning `WP_DB_COLLATE` by itself is not enough: existing tables
keep whatever collation they already have, so you also need to convert them, or you'll get
`Illegal mix of collations` errors on queries that join an old-collation table with a new one.

**1. Check what your existing tables are actually using:**

```bash
make exec mariadb mariadb -u root -p -e "SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();"
```

**2. Decide: keep the existing collation (no drift, no new features) or move to the server's new
default (future-proof, but needs every table converted).** Check what the server's new default
actually is:

```bash
make exec mariadb mariadb -u root -p -e "SHOW VARIABLES LIKE 'collation_server';"
```

**3. If you choose to convert, back up first (`make export`), then convert the database default
and every existing table** — replace `your_collation` with the value from step 1 or 2:

```bash
make exec mariadb mariadb -u root -p -e "ALTER DATABASE wordpress CHARACTER SET utf8mb4 COLLATE your_collation;"
```

Generate and run one `ALTER TABLE` per table (this avoids hand-typing 30+ table names):

```bash
make exec mariadb mariadb -u root -p -N -e "SELECT CONCAT('ALTER TABLE \`', TABLE_NAME, '\` CONVERT TO CHARACTER SET utf8mb4 COLLATE your_collation;') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();" wordpress > /tmp/collation_convert.sql
make exec mariadb mariadb -u root -p wordpress < /tmp/collation_convert.sql
```

This locks each table briefly while it rewrites it — on a large table this can take a while and
should be tested on staging first, not run directly against a live production table set.

**4. Set `WP_DB_COLLATE` in `.env.secret` to the same value**, then `make env <env>` and
`make recreate <env>` so WordPress creates any future table with the same collation.

**5. Verify the site still works** — open the homepage and wp-admin, check
`logs/wordpress/debug.log` for new errors.

### Local database tunnel
The `mariadb` service never publishes a host port directly (in either single- or multi-instance mode), so the database is not reachable from the host by default. To connect from an external app (for example [MySQL Workbench](https://www.mysql.com/products/workbench/), [HeidiSQL](https://www.heidisql.com/) or [PHPStorm](https://www.jetbrains.com/help/phpstorm/configuring-ssh-and-ssl.html)), use `make db-tunnel` to spin up an ephemeral `socat` sidecar container on the compose network that forwards `127.0.0.1:<port>` to the `mariadb` container's `3306`.

`make up` must have been run first - the tunnel script errors if the database container isn't running.

1. Start the tunnel:

```bash
make db-tunnel start
```

The default port is `3306`. To use a different port:

```bash
make db-tunnel start 3307
```

2. Check tunnel status:

```bash
make db-tunnel status
```

3. Open your database management app and connect to `127.0.0.1:<port>`

4. Stop the tunnel when done:

```bash
make db-tunnel stop
```


### phpMyadmin options
To use phpMyadmin need to run the phpMyadmin container first. It's not running by default.

1. Edit the `.env.main` file, find `PMA_EXT_PORT` - make sure that the port is unique. If you are using multiple instances, change the port value.


2. Run phpMyadmin container:

```bash
make pma
```

3. Open the `your-app-domain.com:PMA_EXT_PORT` URL in the browser to access phpMyadmin. For example, we use `PMA_EXT_PORT=8801`. Open `your-app-domain.com:8801`


⚠️  **WARNING 📣 Do not use phpMyadmin on public (production or open stage), it's not secure!**

### Reset database root password
1. In `docker-compose.yml` file uncomment `command: --skip-grant-tables` in mariadb service
2. Restart containers:
```bash
make restart
```
3. Enter inside mariadb container:
```bash
make exec mariadb
```
4. Inside container run:

```bash
mariadb --ssl=OFF
```

```bash
FLUSH PRIVILEGES; ALTER USER 'root'@'%' IDENTIFIED BY 'new_password';
```
Where 'new_password' - new root password

You can reset another database user password too - just change the username, host, and add new password.

For example, there are two `root` users in database - with `%` host and with `localhost`. Use this command to see all users:

```bash
SELECT User, Host FROM mysql.user;
```

5. Revert back changes in `docker-compose.yml`

6. Restart containers:
```bash
make restart
```