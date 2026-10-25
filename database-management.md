# Database management

### Upgrading MariaDB major version

`APP_DATABASE_IMAGE` in `config/environment/.env.main` is pinned to a specific MariaDB tag.
Changing it to a **different version** (major, minor or even patch) is never applied silently to
an environment with existing data: the `mariadb` image ships a **version guard** that refuses to
start the server when the image's version differs from the version `mariadb-upgrade` last recorded
in `./db-data/mariadb_upgrade_info`. The official image on its own only logs "upgrade required,
but skipped" and then starts the new version on the old data.

The comparison is the full `x.y.z`, so even a patch bump stops the server. A fresh, empty
`./db-data` is never blocked.

**How you'll notice it.** `mariadb` never becomes healthy: it exits and restarts in a loop
(`docker ps` shows `Restarting`), and `php`, `nginx` and `cron` stay un-started because they wait
for it. The reason is in the container log:

```bash
make log mariadb
```

```
[version-guard] ERROR: MariaDB server NOT started.
[version-guard]   image version:    <version of the image>
[version-guard]   data directory:   <version recorded in db-data>   # the real log prints x.y.z here
[version-guard] The data was written by another version. Back up db-data, then start once
[version-guard] with MARIADB_AUTO_UPGRADE=1, or switch the image back to the old version.
```

When `make recreate` fails in a CI deploy, the job output ends with the container status and the
last log lines of every service, so the same block shows up there.

**Step 1 — back up.** The guard has stopped the container, so `make export` is not available (it
needs a running database). The copy needs as much free space as the data directory itself, so
check that first, then stop the container and copy it:

```bash
df -h . && du -sh db-data
docker stop <APP_NAME>-mariadb
cp -a db-data db-data.bak-<old-version>
```

`db-data.bak-*` matches the `db-*` exclude of the deploy rsync, so a deploy will not delete it.
The image's own pre-upgrade backup (`system_mysql_backup_<version>.sql.zst`, written into the data
directory) covers the system `mysql` database only — not your site's data. **Downgrading is not
supported:** once the new server has opened the data, the copy is the only way back.

**Step 2 — upgrade.** `MARIADB_AUTO_UPGRADE=1` makes the image run `mariadb-upgrade` itself, once,
on that start (empty and `0` mean off, as in the official image). Pass it for a single command,
so there is nothing to clean up afterwards:

```bash
MARIADB_AUTO_UPGRADE=1 make recreate <env>
```

(Alternatively set `MARIADB_AUTO_UPGRADE=1` in `.env.secret` and remove it again in step 4.)

**Step 3 — verify.** The log shows `Starting mariadb-upgrade` and `Finished mariadb-upgrade`, the
container becomes `healthy`, and the data directory now records the new version:

```bash
make log mariadb
cat db-data/mariadb_upgrade_info
```

**Step 4 — switch the flag off.** Recreate once more without the variable:

```bash
make recreate <env>
```

The container keeps the variable it was created with, so this is what turns it off. With matching
versions the guard now passes silently — the only trace is the line
`Launching /docker-entrypoint.d/10-version-guard.sh`. Do not leave `MARIADB_AUTO_UPGRADE` on
permanently: the next version change would then upgrade without stopping.

**Check that the host really runs the guard image.** Images are built and pushed manually, and
`docker compose up` does not re-pull an image that already exists on the host, so a host only gets
the guard from an image published under a **new tag** that `APP_DATABASE_IMAGE` points to (never
overwrite a tag hosts have already pulled). The guard is present when

```bash
docker inspect --format '{{json .Config.Entrypoint}}' <APP_NAME>-mariadb
```

prints `["/docker-entrypoint.sh"]` (without the leading slash it is the official entrypoint, with
no guard) and the startup log contains the `Launching ... 10-version-guard.sh` line.

**Manual `mariadb-upgrade`.** Running `mariadb-upgrade` by hand inside a running container no
longer applies to this image: the server does not start on old data, so there is nothing to
`exec` into. For a replicated/Galera topology follow MariaDB's own
[Upgrading Between Major MariaDB Versions](https://mariadb.com/kb/en/upgrading-between-major-mariadb-versions/)
guide; the guard would have to be bypassed deliberately and this project does not ship a procedure
for that.

#### Collation drift after a MariaDB version bump (optional)

A MariaDB major-version bump can also change the server's **default collation** (the rule it uses
to compare/sort text) for any new table created without one explicitly set. WordPress's
`DB_COLLATE` in `wp-config.php` (driven by `WP_DB_COLLATE` in `.env.secret`) is empty by default,
so WordPress falls back to whatever the server picks — which means tables created before the
version bump and tables created after it can end up on two different collations.

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